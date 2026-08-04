import httpx
import json
import os
import re
import unicodedata
from typing import Dict, Any, List
from app.config import settings

def normalize_artist_name(name: str) -> str:
    if not name:
        return ""
    nfd = unicodedata.normalize('NFD', name.strip())
    base = "".join(c for c in nfd if not unicodedata.combining(c))
    clean = base.lower()
    return re.sub(r'\s+', ' ', clean).strip()

class MetadataEnrichmentService:
    """
    3-Tier Metadata Pipeline for unknown/new user-added songs:
    1. Tier 1: Last.fm API with autocorrect=1 (extracts community tags & canonical title/artist).
    2. Tier 2: Discogs API (extracts canonical genre & style).
    3. Tier 3: Groq LLM API (llama-3.3-70b-versatile fallback for obscure tracks).
    """

    async def enrich_track_metadata(self, title: str, artist: str) -> Dict[str, Any]:
        title_clean = title.strip()
        artist_clean = artist.strip()

        print(f"[MetadataPipeline] Starting 3-tier enrichment for '{title_clean}' by '{artist_clean}'")

        # 1. Tier 1: Try Last.fm API
        result_data = await self._query_lastfm(title_clean, artist_clean)
        if result_data and result_data.get("tags"):
            print(f"[MetadataPipeline] [OK] Tier 1 (Last.fm) succeeded with {len(result_data['tags'])} tags.")
        else:
            # 2. Tier 2: Try Discogs API
            result_data = await self._query_discogs(title_clean, artist_clean)
            if result_data and result_data.get("tags"):
                print(f"[MetadataPipeline] [OK] Tier 2 (Discogs) succeeded with {len(result_data['tags'])} tags.")
            else:
                # 3. Tier 3: Fallback to Groq LLM API
                result_data = await self._query_groq_llm(title_clean, artist_clean)
                if result_data:
                    print(f"[MetadataPipeline] [OK] Tier 3 (Groq LLM) succeeded.")
                else:
                    # 4. Ultimate Default Fallback if no APIs are configured / accessible
                    print("[MetadataPipeline] [WARN] Using generic heuristic fallback.")
                    result_data = {
                        "title": title_clean,
                        "artist": artist_clean,
                        "genre": "Indie",
                        "tags": ["indie", "alternative", "electronic", "pop", "music"],
                        "source": "fallback"
                    }

        # Irrespective of tag method, retrieve preview link & album cover
        try:
            from app.services.itunes_service import itunes_service
            cover_url, preview_url = itunes_service.fetch_track_metadata(artist_clean, title_clean)

            result_data["cover_url"] = cover_url or ""
            result_data["coverUrl"] = cover_url or ""
            result_data["preview_url"] = preview_url or ""
            result_data["previewUrl"] = preview_url or ""
        except Exception as err:
            print(f"[MetadataPipeline] Notice retrieving cover/preview URL: {err}")
            result_data.setdefault("cover_url", "")
            result_data.setdefault("coverUrl", "")
            result_data.setdefault("preview_url", "")
            result_data.setdefault("previewUrl", "")

        return result_data

    async def _query_lastfm(self, title: str, artist: str) -> Dict[str, Any]:
        api_key = settings.LASTFM_API_KEY
        if not api_key or "your_" in api_key:
            return None

        url = "http://ws.audioscrobbler.com/2.0/"
        params = {
            "method": "track.getInfo",
            "artist": artist,
            "track": title,
            "autocorrect": 1,
            "api_key": api_key,
            "format": "json"
        }

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(url, params=params)
                if res.status_code == 200:
                    data = res.json()
                    track_info = data.get("track", {})
                    if track_info:
                        canonical_title = track_info.get("name", title)
                        canonical_artist = track_info.get("artist", {}).get("name", artist)
                        
                        raw_tags = track_info.get("toptags", {}).get("tag", [])
                        tags = [t.get("name", "").lower() for t in raw_tags if t.get("name")]
                        
                        wiki_summary = track_info.get("wiki", {}).get("summary", "")
                        genre = tags[0].capitalize() if tags else "General"

                        return {
                            "title": canonical_title,
                            "artist": canonical_artist,
                            "genre": genre,
                            "tags": tags,
                            "summary": wiki_summary,
                            "source": "lastfm"
                        }
        except Exception as e:
            print(f"[MetadataPipeline] Last.fm API error: {e}")
        return None

    async def _query_discogs(self, title: str, artist: str) -> Dict[str, Any]:
        token = settings.DISCOGS_USER_TOKEN
        if not token or "your_" in token:
            return None

        url = "https://api.discogs.com/database/search"
        headers = {"User-Agent": "Groove4U/1.0"}
        params = {
            "q": f"{artist} {title}",
            "type": "release",
            "token": token
        }

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(url, headers=headers, params=params)
                if res.status_code == 200:
                    data = res.json()
                    results = data.get("results", [])
                    if results:
                        top_rel = results[0]
                        genres = top_rel.get("genre", [])
                        styles = top_rel.get("style", [])
                        all_tags = [g.lower() for g in genres] + [s.lower() for s in styles]
                        
                        main_genre = genres[0] if genres else "Alternative"
                        return {
                            "title": title,
                            "artist": artist,
                            "genre": main_genre,
                            "tags": all_tags,
                            "source": "discogs"
                        }
        except Exception as e:
            print(f"[MetadataPipeline] Discogs API error: {e}")
        return None

    async def _query_groq_llm(self, title: str, artist: str) -> Dict[str, Any]:
        groq_key = settings.GROQ_API_KEY
        if not groq_key or "your_" in groq_key:
            return None

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json"
        }

        prompt = f"""You are a music metadata expert. Analyze the track '{title}' by artist '{artist}'.
Return a valid JSON object only with these fields:
{{
  "genre": "Main Genre Name",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"]
}}
Return JSON only. Do not include markdown code block syntax."""

        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 150
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    response_json = res.json()
                    content = response_json["choices"][0]["message"]["content"]
                    
                    # Clean JSON output
                    cleaned = re.sub(r'```json\s*|\s*```', '', content).strip()
                    parsed = json.loads(cleaned)
                    
                    return {
                        "title": title,
                        "artist": artist,
                        "genre": parsed.get("genre", "Alternative"),
                        "tags": [t.lower() for t in parsed.get("tags", [])],
                        "source": "groq_llm"
                    }
        except Exception as e:
            print(f"[MetadataPipeline] Groq LLM API error: {e}")
        return None

    _top_tracks_cache: Dict[str, List[Dict[str, str]]] = {}

    async def fetch_global_top_tracks(self, limit: int = 50) -> List[Dict[str, str]]:
        if "global" in self._top_tracks_cache:
            return self._top_tracks_cache["global"][:limit]

        api_key = settings.LASTFM_API_KEY
        if not api_key or "your_" in api_key:
            return []

        url = "http://ws.audioscrobbler.com/2.0/"
        params = {
            "method": "chart.gettoptracks",
            "api_key": api_key,
            "format": "json",
            "limit": limit
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url, params=params)
                if res.status_code == 200:
                    data = res.json()
                    tracks = data.get("tracks", {}).get("track", [])
                    result = []
                    for t in tracks:
                        art = t.get("artist", {}).get("name", "Various Artists")
                        tit = t.get("name", "Track")
                        result.append({"title": tit, "artist": art})
                    self._top_tracks_cache["global"] = result
                    return result[:limit]
        except Exception as e:
            print(f"[MetadataPipeline] Error fetching Last.fm global top tracks: {e}")
        return []

    async def fetch_country_top_tracks(self, country: str, limit: int = 100) -> List[Dict[str, str]]:
        country_clean = country.strip() if country else "United States"
        cache_key = f"geo_{country_clean.lower()}"
        if cache_key in self._top_tracks_cache:
            return self._top_tracks_cache[cache_key][:limit]

        api_key = settings.LASTFM_API_KEY
        if not api_key or "your_" in api_key:
            return await self.fetch_global_top_tracks(limit)

        url = "http://ws.audioscrobbler.com/2.0/"
        params = {
            "method": "geo.gettoptracks",
            "country": country_clean,
            "api_key": api_key,
            "format": "json",
            "limit": limit
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url, params=params)
                if res.status_code == 200:
                    data = res.json()
                    tracks = data.get("tracks", {}).get("track", [])
                    result = []
                    for t in tracks:
                        art = t.get("artist", {}).get("name", "Various Artists")
                        tit = t.get("name", "Track")
                        result.append({"title": tit, "artist": art})
                    self._top_tracks_cache[cache_key] = result
                    return result[:limit]
        except Exception as e:
            print(f"[MetadataPipeline] Error fetching Last.fm geo top tracks for {country_clean}: {e}")
            return await self.fetch_global_top_tracks(limit)

    async def fetch_artist_top_tracks(self, artist: str, limit: int = 5) -> List[Dict[str, str]]:
        artist_clean = artist.strip() if artist else ""
        if not artist_clean:
            return []

        norm_artist = normalize_artist_name(artist_clean)
        cache_key = f"artist_top_{norm_artist}"
        if cache_key in self._top_tracks_cache:
            return self._top_tracks_cache[cache_key][:limit]

        api_key = settings.LASTFM_API_KEY
        if not api_key or "your_" in api_key:
            return []

        url = "http://ws.audioscrobbler.com/2.0/"
        params = {
            "method": "artist.gettoptracks",
            "artist": artist_clean,
            "api_key": api_key,
            "format": "json",
            "limit": limit
        }

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(url, params=params)
                if res.status_code == 200:
                    data = res.json()
                    tracks = data.get("toptracks", {}).get("track", [])
                    result = []
                    for t in tracks:
                        art = t.get("artist", {}).get("name", artist_clean)
                        tit = t.get("name", "Track")
                        result.append({"title": tit, "artist": art})
                    self._top_tracks_cache[cache_key] = result
                    return result[:limit]
        except Exception as e:
            print(f"[MetadataPipeline] Error fetching Last.fm artist top tracks for {artist_clean}: {e}")
        return []

metadata_service = MetadataEnrichmentService()
