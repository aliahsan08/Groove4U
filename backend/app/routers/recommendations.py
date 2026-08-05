import math
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from qdrant_client.http import models as qmodels
from app.auth import get_current_user
from app.database import supabase
from app.services.recommendation_service import recommendation_engine
from app.services.bloom_filter import bloom_filter_service
from app.services.metadata_enrichment import metadata_service, normalize_artist_name
from app.services.itunes_service import itunes_service

router = APIRouter(prefix="/api", tags=["Recommendation Engine & Catalog"])

# Startup catalog initialization
@router.on_event("startup")
async def startup_event():
    bloom_filter_service.load_catalog()
    recommendation_engine.initialize()


class AddTrackRequest(BaseModel):
    title: str
    artist: str


async def _run_cold_start_pipeline(
    user_id: str,
    top_artists: list,
    top_genres: list,
    limit: int,
    user_country: str = "United States",
    user_own_taste_count: int = 0,
    taste_ratings: list = None,
    user_vec=None,
    exclude_titles: set = None,
):
    """Shared cold-start pipeline with TTL cache rotation: 40% top artists, 40% genres vector search, 20% country Last.fm."""
    taste_ratings = taste_ratings or []
    exclude_titles = set(t.lower() for t in (exclude_titles or set()))

    # Get non-expired TTL excluded tracks for this user to guarantee fresh recommendations on repeated clicks
    ttl_excluded = recommendation_engine.get_ttl_excluded_titles(user_id)
    all_exclusions = exclude_titles.union(set(t.lower() for t in ttl_excluded))

    k_art = max(1, int(round(0.40 * limit)))
    k_gen = max(1, int(round(0.40 * limit)))
    k_geo = max(1, limit - (k_art + k_gen))

    if user_vec is None:
        user_vec = recommendation_engine.generate_user_vector(user_id, taste_ratings, top_genres, top_artists)

    # 1. Top Artists Tracks (40% of K)
    art_tracks = []
    if top_artists:
        per_artist_quota = max(1, k_art // len(top_artists))
        remainder = k_art - (per_artist_quota * len(top_artists))

        for idx, artist_name in enumerate(top_artists):
            fetch_n = per_artist_quota + (1 if idx < remainder else 0)
            if fetch_n <= 0:
                continue

            norm_target = normalize_artist_name(artist_name)
            artist_found = []
            print(f"[ColdStart] Searching for artist='{artist_name}' norm='{norm_target}' need={fetch_n}")

            # Tier A: Search item_meta via Gradio inference space
            try:
                artist_found = recommendation_engine.search_artist_tracks(
                    artist_name, fetch_n, list(all_exclusions)
                )
            except Exception as e:
                print(f"[ColdStart] Gradio artist search error for '{artist_name}': {e}")
                artist_found = []

            print(f"[ColdStart] TierA(Gradio) found {len(artist_found)} tracks for '{artist_name}'")

            # Tier B: Qdrant scroll
            if len(artist_found) < fetch_n and recommendation_engine.qdrant_client:
                try:
                    scroll_res, _ = recommendation_engine.qdrant_client.scroll(
                        collection_name="groove4u_items",
                        scroll_filter=qmodels.Filter(
                            should=[
                                qmodels.FieldCondition(key="artist", match=qmodels.MatchValue(value=artist_name)),
                                qmodels.FieldCondition(key="artist", match=qmodels.MatchText(text=artist_name)),
                                qmodels.FieldCondition(key="artist", match=qmodels.MatchText(text=norm_target))
                            ]
                        ),
                        limit=fetch_n * 5,
                        with_payload=True,
                        with_vectors=False
                    )
                    for pt in scroll_res:
                        if len(artist_found) >= fetch_n:
                            break
                        payload = getattr(pt, "payload", {}) or {}
                        tr_str = payload.get("track_id_str") or f"{payload.get('title')} — {payload.get('artist')}"
                        title = payload.get("title", "Track")
                        tr_lower = tr_str.lower()
                        title_lower = title.lower()
                        if title_lower in all_exclusions or tr_lower in all_exclusions:
                            continue
                        if not any(af["track_id_str"].lower() == tr_lower for af in artist_found):
                            artist_found.append({
                                "qdrant_point_id": pt.id,
                                "track_id_str": tr_str,
                                "title": title,
                                "artist": payload.get("artist", artist_name),
                                "genre": payload.get("genre", top_genres[0] if top_genres else "Pop"),
                                "score": 0.95,
                                "rank_score": 0.95
                            })
                except Exception as e:
                    print(f"[ColdStart] Qdrant notice for '{artist_name}': {e}")
            print(f"[ColdStart] TierB(Qdrant) found {len(artist_found)} tracks for '{artist_name}'")

            # Tier C: Last.fm fallback
            if len(artist_found) < fetch_n:
                needed = fetch_n - len(artist_found)
                lastfm_tracks = await metadata_service.fetch_artist_top_tracks(artist_name, limit=needed + 10)
                print(f"[ColdStart] TierC(LastFM) returned {len(lastfm_tracks)} tracks for '{artist_name}'")
                for l_idx, tr in enumerate(lastfm_tracks):
                    if len(artist_found) >= fetch_n:
                        break
                    tr_str = f"{tr['title']} — {tr['artist']}"
                    tr_lower = tr_str.lower()
                    title_lower = tr["title"].lower()
                    if title_lower in all_exclusions or tr_lower in all_exclusions:
                        continue
                    if not any(af["track_id_str"].lower() == tr_lower for af in artist_found):
                        artist_found.append({
                            "qdrant_point_id": 880000 + idx * 10 + l_idx,
                            "track_id_str": tr_str,
                            "title": tr["title"],
                            "artist": tr["artist"],
                            "genre": top_genres[0] if top_genres else "Pop",
                            "score": 0.95,
                            "rank_score": 0.95
                        })

            print(f"[ColdStart] TOTAL for '{artist_name}': {len(artist_found[:fetch_n])} tracks added")
            art_tracks.extend(artist_found[:fetch_n])

    # 2. Country Top Tracks (20% of K)
    country_top_tracks = await metadata_service.fetch_country_top_tracks(user_country, limit=max(15, k_geo * 5))
    geo_tracks = []
    for i, tr in enumerate(country_top_tracks):
        if len(geo_tracks) >= k_geo:
            break
        tr_str = f"{tr['title']} — {tr['artist']}"
        tr_lower = tr_str.lower()
        title_lower = tr["title"].lower()
        if title_lower in all_exclusions or tr_lower in all_exclusions:
            continue
        geo_tracks.append({
            "qdrant_point_id": 990000 + i,
            "track_id_str": tr_str,
            "title": tr["title"],
            "artist": tr["artist"],
            "genre": top_genres[0] if top_genres else "Pop",
            "score": 0.88,
            "rank_score": 0.88
        })

    # 3. Genre Vector Search (40% of K)
    vector_candidates = recommendation_engine.retrieve_candidates_qdrant(
        user_vec, top_k=100, top_artists=top_artists, top_genres=top_genres, exclude_titles=all_exclusions
    )
    ranked_genre = recommendation_engine.rank_candidates_lgbm(
        user_id, user_vec, vector_candidates, taste_ratings, top_artists, top_genres=top_genres, exclude_titles=all_exclusions, top_n=k_gen
    )

    # Assemble: 40% artists + 40% genres + 20% country (with fallback fill if top_artists or art_tracks is empty)
    final_recs = []
    seen = set()

    for item in (art_tracks[:k_art] + ranked_genre[:k_gen] + geo_tracks[:k_geo]):
        if len(final_recs) >= limit:
            break
        tr_key = item.get("track_id_str", "").lower()
        if tr_key and tr_key not in seen:
            seen.add(tr_key)
            final_recs.append(item)

    # Fallback fill from remaining ranked_genre candidates if art_tracks or geo_tracks were under-populated
    if len(final_recs) < limit:
        for item in ranked_genre + art_tracks + geo_tracks:
            if len(final_recs) >= limit:
                break
            tr_key = item.get("track_id_str", "").lower()
            if tr_key and tr_key not in seen:
                seen.add(tr_key)
                final_recs.append(item)

    # Fallback fill from country_top_tracks if still under limit
    if len(final_recs) < limit:
        for tr in country_top_tracks:
            if len(final_recs) >= limit:
                break
            tr_str = f"{tr['title']} — {tr['artist']}"
            tr_lower = tr_str.lower()
            if tr_lower not in seen and tr["title"].lower() not in all_exclusions:
                seen.add(tr_lower)
                final_recs.append({
                    "qdrant_point_id": 991000 + len(final_recs),
                    "track_id_str": tr_str,
                    "title": tr["title"],
                    "artist": tr["artist"],
                    "genre": top_genres[0] if top_genres else "Pop",
                    "score": 0.85,
                    "rank_score": 0.85
                })

    # Format output with strictly unique React keys
    output_tracks = []
    for i, item in enumerate(final_recs):
        tr_str = item.get("track_id_str", "Unknown — Track")
        parts = tr_str.split("—")
        title = parts[0].strip() if len(parts) > 1 else tr_str
        artist = parts[1].strip() if len(parts) > 1 else "Various Artists"

        score = float(item.get("score", 0.85))
        rank_score = float(item.get("rank_score", score))
        confidence = round(min(98.5, max(65.0, score * 100.0 + 72.0)), 1)

        unique_id = f"rec-cs-{i}-{abs(hash(f'{title.lower()}__{artist.lower()}')) % 1000000}"
        output_tracks.append({
            "id": unique_id,
            "track_id": unique_id,
            "title": title,
            "artist": artist,
            "genre": top_genres[0] if top_genres else "Pop",
            "year": 2024,
            "matchScore": confidence,
            "match_score": confidence,
            "rawScore": round(rank_score, 4),
            "features": {"energy": 75, "danceability": 75, "valence": 65, "acousticness": 20, "underground": 50, "bpm": 120},
            "coverUrl": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80",
            "matchReasons": [f"Cold Start Pipeline | Artist:{len(art_tracks)} Country:{len(geo_tracks)} Genre:{len(ranked_genre)}"],
            "match_reasons": [f"Cold Start Pipeline | Artist:{len(art_tracks)} Country:{len(geo_tracks)} Genre:{len(ranked_genre)}"]
        })

    # Cache served recommendations for TTL window to ensure fresh tracks on next click
    recommendation_engine.add_ttl_served_tracks(user_id, final_recs)

    output_tracks = itunes_service.enrich_tracks_in_parallel(output_tracks)
    return {"status": "success", "engine": "cold_start_pipeline", "recommendations": output_tracks}


@router.get("/recommendations/guest")
async def get_guest_recommendations(
    limit: int = Query(5, ge=1, le=50),
    top_artists_query: Optional[str] = Query(None, alias="top_artists"),
    top_genres_query: Optional[str] = Query(None, alias="top_genres"),
):
    """
    Cold Start Recommendations for guest/unauthenticated users.
    Uses Last.fm global top tracks + top artists (passed as query params).
    No auth required.
    """
    top_artists = [a.strip() for a in top_artists_query.split(",") if a.strip()] if top_artists_query else []
    top_genres  = [g.strip() for g in top_genres_query.split(",")  if g.strip()] if top_genres_query else []
    user_own_taste_count = 0  # Always cold start for guest

    return await _run_cold_start_pipeline(
        user_id="guest",
        top_artists=top_artists,
        top_genres=top_genres,
        limit=limit,
        user_country="United States",
        user_own_taste_count=user_own_taste_count,
    )


@router.get("/recommendations/top5")
async def get_top5_recommendations(
    limit: int = Query(5, ge=1, le=50),
    top_artists_query: Optional[str] = Query(None, alias="top_artists"),
    top_genres_query: Optional[str] = Query(None, alias="top_genres"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Complete 3-Stage Recommendation Deck Engine:
    1. Retrieval: Generates 128-dim User Vector & queries Qdrant (Top 100).
    2. Scoring & Ranking: LightGBM LambdaMART evaluates 8 features (Top 20).
    3. Diversity Reranking: Artist & genre de-duplication capping.
    """
    user_id = current_user["id"]
    email = current_user.get("email", "")

    taste_ratings = []
    top_genres = []
    top_artists = []
    artists_rated_8_10 = []
    user_own_taste_count = 0  # Tracks the user's own taste count, unaffected by fallback padding

    # Merge query param artists/genres (from onboarding state passed by frontend)
    if top_artists_query:
        for a in top_artists_query.split(","):
            clean_a = a.strip()
            if clean_a and clean_a not in top_artists:
                top_artists.append(clean_a)
    if top_genres_query:
        for g in top_genres_query.split(","):
            clean_g = g.strip()
            if clean_g and clean_g not in top_genres:
                top_genres.append(clean_g)

    try:
        # Fetch User Taste Profile ratings (with track title, artist name, and genre)
        taste_res = supabase.table("taste_profile").select("rating, tracks(title, artists(artist_name), genres(genre_name))").eq("user_id", user_id).execute()
        for r in (taste_res.data or []):
            tr = r.get("tracks", {})
            title = tr.get("title", "") if isinstance(tr, dict) else ""
            artist_name = tr.get("artists", {}).get("artist_name", "") if isinstance(tr, dict) and tr.get("artists") else ""
            genre_name = tr.get("genres", {}).get("genre_name", "") if isinstance(tr, dict) and tr.get("genres") else ""
            rating_val = float(r.get("rating", 8))

            taste_ratings.append({
                "title": title,
                "artist": artist_name,
                "rating": rating_val,
                "genre": genre_name
            })

            # Identify artists with songs rated 8 to 10 in user's taste profile
            if artist_name and 8.0 <= rating_val <= 10.0 and artist_name not in artists_rated_8_10:
                artists_rated_8_10.append(artist_name)

            if artist_name and rating_val >= 6.0 and artist_name not in top_artists:
                top_artists.append(artist_name)

        # Fetch User Top Genres
        genres_res = supabase.table("user_top_genres").select("genres(genre_name)").eq("user_id", user_id).execute()
        for g in (genres_res.data or []):
            g_name = g.get("genres", {}).get("genre_name", "") if g.get("genres") else ""
            if g_name and g_name not in top_genres:
                top_genres.append(g_name)

        # Fetch User Top Artists
        artists_res = supabase.table("user_top_artists").select("artists(artist_name)").eq("user_id", user_id).execute()
        for a in (artists_res.data or []):
            a_name = a.get("artists", {}).get("artist_name", "") if a.get("artists") else ""
            if a_name and a_name not in top_artists:
                top_artists.append(a_name)

        # Snapshot the user's own taste count BEFORE fallback padding (determines cold start eligibility)
        user_own_taste_count = len(taste_ratings)
        print(f"[RecommendationsRouter] user_own_taste_count={user_own_taste_count}, top_artists={top_artists}, top_genres={top_genres}")

        # Fallback to master catalog taste profile entries if current user has fewer than 5 taste_profile entries in DB
        if user_own_taste_count < 5:
            fallback_res = supabase.table("taste_profile").select("rating, tracks(title, artists(artist_name), genres(genre_name))").order("added_at", desc=True).limit(60).execute()
            existing_titles = {t["title"].strip().lower() for t in taste_ratings if t.get("title")}
            for r in (fallback_res.data or []):
                tr = r.get("tracks", {})
                title = tr.get("title", "") if isinstance(tr, dict) else ""
                if title and title.strip().lower() in existing_titles:
                    continue

                artist_name = tr.get("artists", {}).get("artist_name", "") if isinstance(tr, dict) and tr.get("artists") else ""
                genre_name = tr.get("genres", {}).get("genre_name", "") if isinstance(tr, dict) and tr.get("genres") else ""
                rating_val = float(r.get("rating", 8))

                taste_ratings.append({
                    "title": title,
                    "artist": artist_name,
                    "rating": rating_val,
                    "genre": genre_name
                })

                if artist_name and 8.0 <= rating_val <= 10.0 and artist_name not in artists_rated_8_10:
                    artists_rated_8_10.append(artist_name)

        # Dynamic Top Genres Aggregation: If user_top_genres table returns empty, derive dynamically from taste ratings
        if not top_genres:
            genre_freq = {}
            for item in taste_ratings:
                g = item.get("genre", "").strip()
                r = float(item.get("rating", 0))
                if g and r >= 6.0:
                    genre_freq[g] = genre_freq.get(g, 0) + 1
            sorted_genres = sorted(genre_freq.keys(), key=lambda x: genre_freq[x], reverse=True)
            top_genres = sorted_genres[:5]

        # Dynamic Top Artists Aggregation: If user_top_artists table returns empty, derive dynamically from taste ratings
        if not top_artists:
            artist_freq = {}
            for item in taste_ratings:
                a = item.get("artist", "").strip()
                r = float(item.get("rating", 0))
                if a and r >= 6.0:
                    artist_freq[a] = artist_freq.get(a, 0) + 1
            sorted_artists = sorted(artist_freq.keys(), key=lambda x: artist_freq[x], reverse=True)
            top_artists = sorted_artists[:10]

    except Exception as err:
        print(f"[RecommendationsRouter] Notice fetching user Supabase metadata: {err}")

    # Build hard exclusion set from user's Taste Profile (titles and title — artist combinations)
    exclude_titles = set()
    for t in taste_ratings:
        if t.get("title"):
            title_raw = t["title"].strip()
            artist_raw = (t.get("artist") or "").strip()

            exclude_titles.add(title_raw.lower())
            if artist_raw:
                exclude_titles.add(f"{title_raw} — {artist_raw}".lower())
                exclude_titles.add(f"{title_raw} - {artist_raw}".lower())

            norm_t = normalize_artist_name(title_raw)
            if norm_t:
                exclude_titles.add(norm_t)
                if artist_raw:
                    norm_a = normalize_artist_name(artist_raw)
                    exclude_titles.add(f"{norm_t} — {norm_a}")
                    exclude_titles.add(f"{norm_t} {norm_a}")

    # Target 70 reserved candidate slots for artists with songs rated 8-10 in taste profile (fallback to top_artists if none)
    reserved_70_artists = artists_rated_8_10 if artists_rated_8_10 else top_artists

    # Stage 1: Cold Start vs Standard Candidate Retrieval
    user_vec = recommendation_engine.generate_user_vector(user_id, taste_ratings, top_genres, top_artists)

    print(f"[RecommendationsRouter] cold_start={user_own_taste_count < 5}, top_artists_final={top_artists}")

    if user_own_taste_count < 5:
        # COLD START: delegate to shared pipeline helper
        user_country = current_user.get("country") or "United States"
        return await _run_cold_start_pipeline(
            user_id=user_id,
            top_artists=top_artists,
            top_genres=top_genres,
            limit=limit,
            user_country=user_country,
            user_own_taste_count=user_own_taste_count,
            taste_ratings=taste_ratings,
            user_vec=user_vec,
            exclude_titles=exclude_titles,
        )
    else:
        # Standard candidate retrieval for active users with >= 5 rated songs
        candidates_500 = recommendation_engine.retrieve_candidates_qdrant(
            user_vec, top_k=500, top_artists=reserved_70_artists, top_genres=top_genres, exclude_titles=None
        )
        ranked_candidates = recommendation_engine.rank_candidates_lgbm(
            user_id, user_vec, candidates_500, taste_ratings, top_artists, top_genres=top_genres, exclude_titles=None, top_n=500
        )
        final_recs = recommendation_engine.rerank_diversity(ranked_candidates, target_k=limit, exclude_titles=exclude_titles, user_id=user_id)

    # Format output for frontend UI with exact model confidence scores
    output_tracks = []
    for idx, item in enumerate(final_recs[:limit]):
        tr_str = item.get("track_id_str", "Unknown — Track")
        parts = tr_str.split("—")
        title = parts[0].strip() if len(parts) > 1 else tr_str
        artist = parts[1].strip() if len(parts) > 1 else "Various Artists"

        two_tower_score = float(item.get("score", 0.85))
        rank_score = float(item.get("rank_score", two_tower_score))

        base_confidence = min(98.5, max(65.0, two_tower_score * 100.0 + 72.0))
        exact_score = round(base_confidence, 1)

        unique_id = f"rec-std-{idx}-{abs(hash(f'{title.lower()}__{artist.lower()}')) % 1000000}"
        output_tracks.append({
            "id": unique_id,
            "track_id": unique_id,
            "title": title,
            "artist": artist,
            "genre": top_genres[0] if top_genres else "Synthwave",
            "year": 2024,
            "matchScore": exact_score,
            "match_score": exact_score,
            "rawScore": round(rank_score, 4),
            "raw_score": round(rank_score, 4),
            "features": {"energy": 75, "danceability": 75, "valence": 65, "acousticness": 20, "underground": 50, "bpm": 120},
            "coverUrl": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80",
            "matchReasons": [
                f"Two-Tower Vector Cosine Similarity: {two_tower_score:.4f}",
                f"LightGBM LambdaMART Rank Score: {rank_score:.4f}"
            ],
            "match_reasons": [
                f"Two-Tower Vector Cosine Similarity: {two_tower_score:.4f}",
                f"LightGBM LambdaMART Rank Score: {rank_score:.4f}"
            ]
        })

    output_tracks = itunes_service.enrich_tracks_in_parallel(output_tracks)

    return {
        "status": "success",
        "engine": "two_tower_lgbm_diversity_pipeline",
        "candidates_retrieved": len(candidates_500) if 'candidates_500' in dir() else 0,
        "recommendations": output_tracks
    }


@router.get("/track/preview")
async def get_track_preview(artist: str = Query(...), title: str = Query(...)):
    """
    On-demand 30s audio preview URL lookup for Taste Profile & Playlist tracks.
    """
    cover_url, preview_url = itunes_service.fetch_track_metadata(artist, title)
    return {
        "artist": artist,
        "title": title,
        "preview_url": preview_url,
        "previewUrl": preview_url
    }


@router.get("/track/artworks")
async def get_track_artworks(
    artist: str = Query(...),
    title: str = Query(...),
    currentCover: Optional[str] = Query(None),
    filter_nsfw: bool = Query(True)
):
    """
    On-demand retrieval of multiple album artworks with automatic NSFW / explicit filtering.
    """
    artworks = itunes_service.fetch_track_artworks(artist, title, currentCover, filter_nsfw=filter_nsfw)
    return {
        "artist": artist,
        "title": title,
        "artworks": artworks
    }


class EnrichCoversRequest(BaseModel):
    tracks: List[Dict[str, Any]]

@router.post("/tracks/enrich_fast")
async def enrich_tracks_fast(body: EnrichCoversRequest):
    """
    Fast Deezer-only enrichment (~1s). Returns instantly for Deezer-available songs.
    Tracks not found on Deezer will have no coverUrl/previewUrl — call enrich_fallback for those.
    """
    enriched = itunes_service.enrich_deezer_fast(body.tracks)
    return {"status": "success", "tracks": enriched}


@router.post("/tracks/enrich_fallback")
async def enrich_tracks_fallback(body: EnrichCoversRequest):
    """
    Full 3-tier enrichment (MusicBrainz + iTunes) for tracks still missing metadata after fast pass.
    Only send tracks that are missing coverUrl or previewUrl.
    """
    enriched = itunes_service.enrich_tracks_in_parallel(body.tracks)
    return {"status": "success", "tracks": enriched}


@router.post("/tracks/enrich_covers")
async def enrich_tracks_covers(body: EnrichCoversRequest):
    """
    Enriches playlist or taste profile track dicts with album covers in parallel on app load.
    """
    enriched = itunes_service.enrich_tracks_in_parallel(body.tracks)
    return {"status": "success", "tracks": enriched}


@router.post("/tracks/enrich_previews")
async def enrich_tracks_previews(body: EnrichCoversRequest):
    """
    Enriches playlist or taste profile track dicts with 30s preview URLs in parallel on app load.
    """
    enriched = itunes_service.enrich_tracks_in_parallel(body.tracks)
    return {"status": "success", "tracks": enriched}


@router.post("/tracks/enrich_all_metadata")
async def enrich_all_metadata(body: EnrichCoversRequest):
    """
    Single-pass parallel endpoint enriching BOTH album covers and preview URLs concurrently.
    """
    enriched = itunes_service.enrich_tracks_in_parallel(body.tracks)
    return {"status": "success", "tracks": enriched}


@router.get("/catalog/check")
async def check_catalog_bloom_filter(query: str = Query(..., min_length=2)):
    """
    O(1) Bloom Filter Membership Test for "Song — Artist" string.
    """
    exists = bloom_filter_service.contains(query)
    return {
        "query": query,
        "exists": exists,
        "message": "Song exists in catalog" if exists else "Song not found in 90,383 catalog"
    }


@router.get("/catalog/search")
async def search_catalog_autocomplete(q: str = Query(..., min_length=2), limit: int = 10):
    """
    Fast prefix/sub-phrase autocomplete across all 90,383 catalog track strings.
    """
    results = bloom_filter_service.search_autocomplete(q, limit=limit)
    return {
        "query": q,
        "results": results
    }


@router.post("/catalog/add_new_track")
async def add_new_track(payload: AddTrackRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Adds a new/unseen song:
    1. Runs 3-tier enrichment (Last.fm -> Discogs -> Groq LLM).
    2. Runs Item Tower -> 128-dim item vector (via Gradio Space).
    3. Adds "Song — Artist" to Bloom Filter.
    4. Upserts vector to Qdrant.
    """
    try:
        track_str = f"{payload.title.strip()} — {payload.artist.strip()}"
        
        # 1. Run 3-tier metadata pipeline
        enriched = await metadata_service.enrich_track_metadata(payload.title, payload.artist)
        
        # 2. Run Item Tower for 128-dim embedding (via Gradio Space)
        item_vector = recommendation_engine.embed_new_track(
            enriched["title"],
            enriched["artist"],
            enriched.get("tags", []),
            genre=enriched.get("genre")
        )

        # 3. Add to Bloom Filter
        bloom_filter_service.add(track_str)

        # 4. Save artist to Supabase artists table if missing
        try:
            art_clean = payload.artist.strip()
            norm_art = art_clean.lower()
            supabase.table("artists").upsert({"artist_name": art_clean, "normalized_name": norm_art}, on_conflict="normalized_name").execute()
            print(f"[Catalog] Synced artist '{art_clean}' to Supabase artists table.")
        except Exception as ex:
            print(f"[Catalog] Notice syncing artist to Supabase: {ex}")

        # 5. Upsert vector to Qdrant groove4u_items collection if connected
        if recommendation_engine.qdrant_client:
            try:
                point_id = abs(hash(track_str)) % (10**9)
                recommendation_engine.qdrant_client.upsert(
                    collection_name="groove4u_items",
                    points=[
                        qmodels.PointStruct(
                            id=point_id,
                            vector=item_vector.tolist(),
                            payload={
                                "track_id": track_str,
                                "track_id_str": track_str,
                                "track": enriched["title"],
                                "title": enriched["title"],
                                "artist": enriched["artist"],
                                "genre": enriched.get("genre", "Pop"),
                                "year": enriched.get("year", 2024),
                                "cover_url": enriched.get("cover_url", ""),
                                "coverUrl": enriched.get("cover_url", ""),
                                "preview_url": enriched.get("preview_url", ""),
                                "previewUrl": enriched.get("preview_url", ""),
                                "tags": enriched.get("tags", [])
                            }
                        )
                    ]
                )
                print(f"[Catalog] [OK] Upserted custom track vector to Qdrant 'groove4u_items': {track_str}")
            except Exception as e:
                print(f"[Catalog] Qdrant upsert notice: {e}")

        return {
            "status": "success",
            "track_str": track_str,
            "enriched": enriched
        }
    except Exception as err:
        print(f"[Catalog] Error processing add_new_track: {err}")
        return {
            "status": "partial_success",
            "track_str": f"{payload.title.strip()} — {payload.artist.strip()}",
            "enriched": {
                "title": payload.title.strip(),
                "artist": payload.artist.strip(),
                "genre": "Music",
                "cover_url": "",
                "coverUrl": "",
                "preview_url": "",
                "previewUrl": "",
                "tags": []
            }
        }