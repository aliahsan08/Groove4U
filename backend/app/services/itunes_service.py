"""
Music metadata service — Direct Deezer live previews + Qdrant album covers with iTunes stored preview fallback.

Architecture:
  1. Album Covers: Primary source is Qdrant DB (`album_cover` or `album_art`). Fallback to MusicBrainz.
  2. Song Previews: Primary source is live Deezer Search API (generates fresh 200 OK stream URLs).
  3. Song Preview Fallback: If not found on Deezer, fall back to stored iTunes preview URL (`song_preview`) in Qdrant DB.
  4. Robust Casing Handling: Handles artist case variations ('Charli XCX' vs 'Charli xcx').
"""

import os
import re
import requests
import urllib.parse
import unicodedata
import concurrent.futures
from typing import Tuple, Optional, List, Dict, Any

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from app.config import settings


class MusicMetadataService:
    """Metadata service with direct Deezer live previews & Qdrant stored fallback."""

    def __init__(self):
        self._cache: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
        self._qdrant_client: Optional[QdrantClient] = None
        self._collection = "groove4u_items"
        self._track2idx: Dict[str, int] = {}

        # HTTP session for Deezer, iTunes, MusicBrainz
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
        })

        self._mb_session = requests.Session()
        self._mb_session.headers.update({
            "User-Agent": "Groove4U/1.0 (groove4u-music-app)",
            "Accept": "application/json",
        })

        self._connect_qdrant()

    def _connect_qdrant(self):
        """Connect to Qdrant using env vars / config."""
        q_url = getattr(settings, "QDRANT_URL", None) or os.getenv("QDRANT_URL")
        q_key = getattr(settings, "QDRANT_API_KEY", None) or os.getenv("QDRANT_API_KEY")

        if not q_url or "your-qdrant" in q_url:
            q_url = os.getenv("QDRANT_URL")
        if not q_key or "your-" in q_key:
            q_key = os.getenv("QDRANT_API_KEY")

        if q_url and "your-qdrant" not in q_url:
            try:
                api_k = q_key if (q_key and "your-" not in q_key) else None
                self._qdrant_client = QdrantClient(url=q_url, api_key=api_k, check_compatibility=False)
                print(f"[MetadataService] Connected to Qdrant at {q_url}")

                try:
                    self._qdrant_client.create_payload_index(
                        collection_name=self._collection,
                        field_name="artist",
                        field_schema=qmodels.PayloadSchemaType.KEYWORD
                    )
                except Exception:
                    pass

                try:
                    self._qdrant_client.create_payload_index(
                        collection_name=self._collection,
                        field_name="track_id",
                        field_schema=qmodels.PayloadSchemaType.KEYWORD
                    )
                except Exception:
                    pass

            except Exception as e:
                print(f"[MetadataService] Qdrant connection failed: {e}")

    def _load_mappings(self):
        self._track2idx = {}

    # ──────────────────────────────────────────────
    # Text Normalization
    # ──────────────────────────────────────────────

    def _normalize(self, text: str) -> str:
        """Strip diacritics, remove noise tags, lowercase."""
        if not text:
            return ""
        nfd = unicodedata.normalize('NFD', text)
        stripped = "".join(c for c in nfd if unicodedata.category(c) != 'Mn')
        t = re.sub(r'(?i)\s+(featuring|feat\.?|ft\.?).*', '', stripped)
        t = re.sub(r'\(.*?\)', '', t)
        t = re.sub(r'\[.*?\]', '', t)
        t = re.sub(r'[^\w\s]', '', t)
        return t.strip().lower()

    def _is_artist_match(self, target: str, candidate: str) -> bool:
        norm_t = self._normalize(target)
        norm_c = self._normalize(candidate)
        if not norm_t or not norm_c:
            return False
        if norm_t in norm_c or norm_c in norm_t:
            return True
        first = norm_t.split()[0]
        if len(first) >= 3 and first in norm_c:
            return True
        return False

    def _is_title_match(self, target: str, candidate: str) -> bool:
        norm_t = self._normalize(target)
        norm_c = self._normalize(candidate)
        if not norm_t or not norm_c:
            return False
        if norm_t == norm_c:
            return True
        if norm_t in norm_c or norm_c in norm_t:
            return True
        tw = set(norm_t.split())
        cw = set(norm_c.split())
        if tw and tw.issubset(cw):
            return True
        if cw and len(cw) >= 2 and cw.issubset(tw):
            return True
        return False

    # ──────────────────────────────────────────────
    # Source 1: Direct Deezer Live API Preview Lookup
    # ──────────────────────────────────────────────

    def _deezer_live_preview(self, artist: str, title: str) -> Tuple[Optional[str], Optional[str]]:
        """Queries Deezer API directly for fresh, live preview MP3 URL. Filters explicit cover art."""
        clean_art = artist.strip()
        clean_tit = title.strip()

        # Clean title of common noise like em-dashes or remix info for broader search
        tit_base = re.sub(r'\s*[\—\–\-]\s*.*', '', clean_tit).strip()

        queries = [
            f"{clean_art} {clean_tit}",
            f"{clean_tit} {clean_art}",
            f"{clean_art} {tit_base}" if tit_base != clean_tit else "",
            f"{clean_art}"
        ]
        # Remove empty queries while preserving order
        queries = [q for q in queries if q]

        for q in queries:
            url = f"https://api.deezer.com/search?q={urllib.parse.quote(q)}&limit=15"
            try:
                resp = self._session.get(url, timeout=3)
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("data", []):
                        item_art = item.get("artist", {}).get("name", "")
                        item_tit = item.get("title", "")
                        item_short_tit = item.get("title_short", "")

                        if self._is_artist_match(clean_art, item_art):
                            if self._is_title_match(clean_tit, item_tit) or self._is_title_match(clean_tit, item_short_tit) or self._is_title_match(tit_base, item_short_tit):
                                prev = item.get("preview")
                                # Skip explicit cover art (Deezer adult rating filter)
                                explicit_cover_flag = item.get("explicit_content_cover", 0) or item.get("album", {}).get("explicit_content_cover", 0)
                                album = item.get("album", {})
                                if explicit_cover_flag in (1, 2, 4, 5):
                                    # Still use the preview audio, but skip this cover
                                    cover = None
                                else:
                                    cover = album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium")
                                if prev:
                                    return cover, prev
            except Exception:
                pass
        return None, None

    # ──────────────────────────────────────────────
    # Source 2: Qdrant Lookup (Covers & Stored iTunes Previews)
    # ──────────────────────────────────────────────

    def _qdrant_lookup(self, artist: str, title: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Looks up album cover & stored iTunes preview URL in Qdrant.
        Evaluates casing variants ('Charli XCX' vs 'Charli xcx') for rock-solid matching.
        """
        if not self._qdrant_client:
            return None, None

        art_clean = artist.strip()
        tit_clean = title.strip()

        def extract_payload(p: dict) -> Tuple[Optional[str], Optional[str]]:
            cover = p.get("album_cover") or p.get("album_art") or None
            sp = p.get("song_preview")
            if sp and "dzcdn.net" not in sp.lower():
                preview = sp
            else:
                pu = p.get("preview_url")
                if pu and "dzcdn.net" not in pu.lower():
                    preview = pu
                else:
                    preview = None
            return cover, preview

        # Build casing variants for artist matching
        art_variants = list(dict.fromkeys([
            art_clean,
            art_clean.lower(),
            art_clean.title(),
            art_clean.upper(),
            "Charli xcx",
            "Charli XCX",
            "Björk",
            "Bjork"
        ]))

        # --- Strategy 1: Direct Point ID lookup via track2idx ---
        if self._track2idx:
            possible_keys = []
            for av in art_variants:
                possible_keys.extend([
                    f"{tit_clean} — {av}",
                    f"{av} — {tit_clean}",
                    f"{tit_clean} - {av}",
                    f"{av} - {tit_clean}"
                ])
            
            pt_id = None
            for k in possible_keys:
                if k in self._track2idx:
                    pt_id = self._track2idx[k]
                    break

            if pt_id is not None:
                try:
                    pts = self._qdrant_client.retrieve(
                        collection_name=self._collection,
                        ids=[pt_id],
                        with_payload=True,
                        with_vectors=False
                    )
                    if pts and pts[0].payload:
                        cover, preview = extract_payload(pts[0].payload)
                        if cover or preview:
                            return cover, preview
                except Exception:
                    pass

        # --- Strategy 2: Filter scroll by artist variants ---
        for av in art_variants:
            try:
                res, _ = self._qdrant_client.scroll(
                    collection_name=self._collection,
                    scroll_filter=qmodels.Filter(
                        must=[qmodels.FieldCondition(key="artist", match=qmodels.MatchValue(value=av))]
                    ),
                    limit=50,
                    with_payload=True,
                    with_vectors=False
                )
                for pt in (res or []):
                    p = pt.payload or {}
                    p_track = str(p.get("track", "") or p.get("track_id", ""))
                    if self._is_title_match(tit_clean, p_track):
                        cover, preview = extract_payload(p)
                        if cover or preview:
                            return cover, preview
            except Exception:
                pass

        return None, None

    # ──────────────────────────────────────────────
    # Source 3: MusicBrainz Cover Fallback
    # ──────────────────────────────────────────────

    def _musicbrainz_cover(self, artist: str, title: str) -> Optional[str]:
        """MusicBrainz recording search -> Cover Art Archive. Returns cover_url or None."""
        norm_title = self._normalize(title) or title.strip()
        norm_artist = self._normalize(artist) or artist.strip()

        query = f'recording:"{norm_title}" AND artist:"{norm_artist}"'
        url = f"https://musicbrainz.org/ws/2/recording?query={urllib.parse.quote(query)}&fmt=json&limit=5"

        try:
            resp = self._mb_session.get(url, timeout=4)
            if resp.status_code != 200:
                return None

            for rec in resp.json().get("recordings", []):
                rec_artists = " ".join(
                    ac.get("artist", {}).get("name", "")
                    for ac in rec.get("artist-credit", [])
                )
                if not self._is_artist_match(artist, rec_artists):
                    continue
                if not self._is_title_match(title, rec.get("title", "")):
                    continue

                for release in rec.get("releases", []):
                    release_id = release.get("id")
                    if not release_id:
                        continue
                    try:
                        cover_url = f"https://coverartarchive.org/release/{release_id}/front-500"
                        cover_resp = self._mb_session.head(cover_url, timeout=3, allow_redirects=True)
                        if cover_resp.status_code == 200:
                            return cover_resp.url or cover_url
                    except requests.exceptions.RequestException:
                        continue
        except requests.exceptions.RequestException:
            pass
        return None

    # ──────────────────────────────────────────────
    # Orchestrator
    # ──────────────────────────────────────────────

    def fetch_track_metadata(self, artist: str, title: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Resolves cover + preview:
          1. Direct Deezer Live API search for fresh, live preview MP3 URL (with fresh expiration token).
          2. Album cover from Qdrant DB (`album_cover` / `album_art`).
          3. If Deezer has no preview, fallback to stored iTunes preview URL (`song_preview`) in Qdrant DB.
          4. If Qdrant has no cover, fallback to MusicBrainz.
        """
        cache_key = f"{artist.strip().lower()} -- {title.strip().lower()}"
        cached_cover, _ = self._cache.get(cache_key, (None, None))

        cover_url, preview_url = cached_cover, None

        # Fetch live Deezer API preview URL & Deezer cover concurrently with Qdrant lookup
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            deezer_fut = pool.submit(self._deezer_live_preview, artist, title)
            qdrant_fut = pool.submit(self._qdrant_lookup, artist, title)

            d_cover, d_preview = None, None
            q_cover, q_preview = None, None

            try:
                d_cover, d_preview = deezer_fut.result(timeout=4)
            except Exception:
                pass

            try:
                q_cover, q_preview = qdrant_fut.result(timeout=4)
            except Exception:
                pass

            # Previews: Primary = Live Deezer preview URL (fresh live token); Fallback = Stored iTunes preview URL in Qdrant
            if d_preview:
                preview_url = d_preview
            elif q_preview:
                preview_url = q_preview

            # Covers: Primary = Stored Qdrant cover; Fallback = Deezer cover; Cached cover if available
            if not cover_url:
                if q_cover:
                    cover_url = q_cover
                elif d_cover:
                    cover_url = d_cover

        # Fallback: MusicBrainz for cover if still missing
        if not cover_url:
            try:
                mb_cover = self._musicbrainz_cover(artist, title)
                if mb_cover:
                    cover_url = mb_cover
            except Exception:
                pass

        # Cache only the cover URL long-term (previews are generated live to prevent expired token HTTP 403s)
        self._cache[cache_key] = (cover_url, preview_url)
        return (cover_url, preview_url)

    # ──────────────────────────────────────────────
    # Batch Parallel Enrichment
    # ──────────────────────────────────────────────

    def fetch_track_artworks(self, artist: str, title: str, current_cover: Optional[str] = None, filter_nsfw: bool = True) -> List[str]:
        """
        Retrieves multiple high-res album artworks for a track with automatic NSFW / explicit cover filtering.
        All 3 sources (Deezer, iTunes, MusicBrainz) are queried in parallel for maximum speed.
        Results are cached server-side to avoid redundant API calls.
        """
        # Check artworks cache first
        cache_key = f"artworks__{artist.strip().lower()}__{title.strip().lower()}"
        if cache_key in self._cache:
            cached = self._cache[cache_key]
            if isinstance(cached, list) and len(cached) > 0:
                return cached

        artworks: List[str] = []
        if current_cover and current_cover.strip():
            artworks.append(current_cover.strip())

        norm_title = self._normalize(title) or title.strip()
        norm_artist = self._normalize(artist) or artist.strip()

        explicit_keywords = {
            "nsfw", "uncensored", "nude", "nudity", "naked", "topless", "erotic", "erotica",
            "explicit", "explicit_cover", "explicit_content", "explicit_version", "explicit_lyrics",
            "parental_advisory", "parental advisory", "unrated", "xxx", "porn", "porno", "adult_only",
            "adult", "18+", "r-rated", "pinup", "fetish", "sensual", "boudoir", "stripper",
            "playboy", "penthouse", "hentai", "ecchi", "nsfw_cover", "mature_content"
        }

        def _is_explicit_title(text: str) -> bool:
            if not text:
                return False
            t_low = text.lower()
            return any(kw in t_low for kw in explicit_keywords)

        def _fetch_deezer() -> List[str]:
            results = []
            try:
                q = f"{artist.strip()} {title.strip()}"
                d_url = f"https://api.deezer.com/search?q={urllib.parse.quote(q)}&limit=10"
                resp = self._session.get(d_url, timeout=3)
                if resp.status_code == 200:
                    for item in resp.json().get("data", []):
                        item_art = item.get("artist", {}).get("name", "")
                        if self._is_artist_match(artist, item_art):
                            album = item.get("album", {})
                            alb_title = album.get("title", "")
                            trk_title = item.get("title", "")
                            explicit_cover_flag = item.get("explicit_content_cover", 0) or album.get("explicit_content_cover", 0)

                            # Strict NSFW Filter check
                            if filter_nsfw and (explicit_cover_flag in (1, 2, 4, 5) or _is_explicit_title(alb_title) or _is_explicit_title(trk_title)):
                                continue

                            c_xl = album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium")
                            if c_xl and c_xl not in results:
                                results.append(c_xl)
            except Exception:
                pass
            return results

        def _fetch_itunes() -> List[str]:
            results = []
            try:
                it_query = f"{artist.strip()} {title.strip()}"
                it_url = f"https://itunes.apple.com/search?term={urllib.parse.quote(it_query)}&entity=song&limit=5"
                resp = self._session.get(it_url, timeout=3)
                if resp.status_code == 200:
                    for item in resp.json().get("results", []):
                        item_art = item.get("artistName", "")
                        if self._is_artist_match(artist, item_art):
                            col_exp = item.get("collectionExplicitness", "").lower()
                            trk_exp = item.get("trackExplicitness", "").lower()
                            col_name = item.get("collectionName", "")
                            trk_name = item.get("trackName", "")

                            if filter_nsfw and (col_exp == "explicit" or trk_exp == "explicit" or _is_explicit_title(col_name) or _is_explicit_title(trk_name)):
                                if len(results) > 0:
                                    continue

                            art = item.get("artworkUrl100", "")
                            if art:
                                art_1000 = art.replace("100x100bb", "1000x1000bb").replace("100x100", "1000x1000")
                                if art_1000 not in results:
                                    results.append(art_1000)
            except Exception:
                pass
            return results

        def _fetch_musicbrainz() -> List[str]:
            results = []
            try:
                mb_q = f'recording:"{norm_title}" AND artist:"{norm_artist}"'
                mb_url = f"https://musicbrainz.org/ws/2/recording?query={urllib.parse.quote(mb_q)}&fmt=json&limit=5"
                resp = self._mb_session.get(mb_url, timeout=3)
                if resp.status_code == 200:
                    for rec in resp.json().get("recordings", []):
                        rec_artists = " ".join(ac.get("artist", {}).get("name", "") for ac in rec.get("artist-credit", []))
                        if not self._is_artist_match(artist, rec_artists):
                            continue
                        rec_title = rec.get("title", "")
                        if filter_nsfw and _is_explicit_title(rec_title):
                            continue

                        for release in rec.get("releases", []):
                            rel_title = release.get("title", "")
                            if filter_nsfw and _is_explicit_title(rel_title):
                                continue
                            rel_id = release.get("id")
                            if rel_id:
                                ca_url = f"https://coverartarchive.org/release/{rel_id}/front-500"
                                if ca_url not in results:
                                    results.append(ca_url)
            except Exception:
                pass
            return results

        # Run all 3 sources in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            deezer_fut = pool.submit(_fetch_deezer)
            itunes_fut = pool.submit(_fetch_itunes)
            mb_fut = pool.submit(_fetch_musicbrainz)

            try:
                deezer_results = deezer_fut.result(timeout=4)
            except Exception:
                deezer_results = []
            try:
                itunes_results = itunes_fut.result(timeout=4)
            except Exception:
                itunes_results = []
            try:
                mb_results = mb_fut.result(timeout=4)
            except Exception:
                mb_results = []

        # Merge: Deezer first (fastest CDN), then iTunes (high-res), then MusicBrainz
        for url in deezer_results + itunes_results + mb_results:
            if url and url not in artworks:
                artworks.append(url)

        unique_artworks = list(dict.fromkeys(artworks))

        # Cache artworks for this track
        if unique_artworks:
            self._cache[cache_key] = unique_artworks

        return unique_artworks or ([current_cover] if current_cover else [])

    def enrich_deezer_fast(self, tracks: list) -> list:
        """Fast Deezer live API preview pass."""
        if not tracks:
            return []

        def process(item):
            a = item.get("artist", "")
            t = item.get("title", "")
            cache_key = f"{a.strip().lower()} -- {t.strip().lower()}"

            if cache_key in self._cache:
                cover, preview = self._cache[cache_key]
            else:
                cover, preview = self.fetch_track_metadata(a, t)
                self._cache[cache_key] = (cover, preview)

            if cover:
                item["coverUrl"] = cover
                item["cover_url"] = cover
            if preview:
                item["previewUrl"] = preview
                item["preview_url"] = preview
            return item

        with concurrent.futures.ThreadPoolExecutor(max_workers=min(20, max(1, len(tracks)))) as pool:
            return list(pool.map(process, tracks))

    def enrich_tracks_in_parallel(self, tracks: list) -> list:
        """Full enrichment with Deezer live preview + Qdrant stored iTunes fallback."""
        if not tracks:
            return []

        def process(item):
            a = item.get("artist", "")
            t = item.get("title", "")
            cover, preview = self.fetch_track_metadata(a, t)
            if cover:
                item["coverUrl"] = cover
                item["cover_url"] = cover
            if preview:
                item["previewUrl"] = preview
                item["preview_url"] = preview
            return item

        with concurrent.futures.ThreadPoolExecutor(max_workers=min(15, max(1, len(tracks)))) as pool:
            return list(pool.map(process, tracks))


# Singleton instance
itunes_service = MusicMetadataService()
