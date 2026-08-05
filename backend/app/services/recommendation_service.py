"""
Recommendation Engine Service (Lightweight — no ML dependencies).

All ML model inference (PyTorch Two-Tower, LightGBM LambdaMART) has been
offloaded to a Gradio HF Space.  This service now only handles:
  - Qdrant vector search (candidate retrieval)
  - Diversity reranking (pure Python)
  - TTL cache for fresh recommendations
  - HTTP calls to the Gradio Space for vector generation & ranking

No torch, lightgbm, joblib, or pandas are imported here.
"""

import os
import time
import httpx
import numpy as np
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from app.config import settings


def normalize_gradio_url(raw_url: str) -> str:
    """
    Normalizes any HuggingFace Space reference into a valid HTTPS direct API URL.
    Handles:
      - "aliahsan08/g4u_inference" -> "https://aliahsan08-g4u-inference.hf.space"
      - "aliahsan08/g4u-inference" -> "https://aliahsan08-g4u-inference.hf.space"
      - "https://huggingface.co/spaces/aliahsan08/g4u_inference" -> "https://aliahsan08-g4u-inference.hf.space"
      - "https://aliahsan08-g4u-inference.hf.space" -> "https://aliahsan08-g4u-inference.hf.space"
    """
    if not raw_url:
        return "https://aliahsan08-g4u-inference.hf.space"

    raw = raw_url.strip().rstrip("/")

    # Case 1: Full HF web URL (https://huggingface.co/spaces/owner/space_name)
    if "huggingface.co/spaces/" in raw:
        space_path = raw.split("huggingface.co/spaces/")[-1]
        parts = [p for p in space_path.split("/") if p]
        if len(parts) >= 2:
            owner = parts[0].lower().replace("_", "-")
            space = parts[1].lower().replace("_", "-")
            return f"https://{owner}-{space}.hf.space"

    # Case 2: Direct "owner/space_name" format (e.g. "aliahsan08/g4u_inference")
    if not raw.startswith("http://") and not raw.startswith("https://"):
        if "/" in raw:
            parts = [p for p in raw.split("/") if p]
            if len(parts) == 2:
                owner = parts[0].lower().replace("_", "-")
                space = parts[1].lower().replace("_", "-")
                return f"https://{owner}-{space}.hf.space"

    return raw


class RecommendationEngineService:
    def __init__(self):
        self.is_initialized = False
        self.qdrant_client = None

        # 120-second TTL cache to prevent repeating recommendations
        self.ttl_cache = {}  # { user_id: { track_identifier_lower: expiry_timestamp } }
        self.ttl_seconds = 120.0

        # Gradio Space URL for ML inference (resolves "username/space", full web URL, or direct .hf.space domain)
        raw_url = (
            getattr(settings, "GRADIO_SPACE_URL", None)
            or os.getenv("GRADIO_SPACE_URL")
            or os.getenv("HF_SPACE_URL", "")
        )
        self.gradio_url = normalize_gradio_url(raw_url)

        # HTTP client for Gradio API calls (reuse connection)
        self._http_client = None

    def _get_headers(self) -> dict:
        headers = {}
        token = getattr(settings, "HF_READ_TOKEN", None) or os.getenv("HF_READ_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    # ── HTTP Client ────────────────────────────

    def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=30.0)
        return self._http_client

    # ── Gradio API Call Helper ─────────────────

    async def _call_gradio_api(self, api_name: str, data: dict) -> Any:
        """
        Calls a Gradio Space API endpoint via HTTP POST.
        Gradio's /call/{api_name} endpoint accepts JSON and returns a result.
        """
        url = f"{self.gradio_url}/call/{api_name}"
        headers = self._get_headers()
        try:
            client = self._get_http_client()
            import json
            payload = {"data": list(data.values())}

            # Step 1: Submit the prediction
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                print(f"[RecEngine] Gradio API {api_name} returned status {resp.status_code}: {resp.text}")
                return None

            result = resp.json()
            if "event_id" not in result:
                # Some Gradio versions return data directly
                if "data" in result:
                    return result["data"][0] if isinstance(result["data"], list) else result["data"]
                return None

            # Step 2: Fetch the result via SSE stream
            event_id = result["event_id"]
            result_url = f"{self.gradio_url}/call/{api_name}/{event_id}"
            result_resp = await client.get(result_url, headers=headers)
            if result_resp.status_code == 200:
                text = result_resp.text
                current_event = None
                for line in text.split("\n"):
                    line_str = line.strip()
                    if line_str.startswith("event: "):
                        current_event = line_str[7:].strip()
                    elif line_str.startswith("data: "):
                        data_str = line_str[6:].strip()
                        if data_str == "null":
                            continue
                        try:
                            parsed = json.loads(data_str)
                            if current_event == "complete" or current_event is None:
                                if isinstance(parsed, list) and len(parsed) > 0:
                                    return parsed[0]
                                if parsed is not None:
                                    return parsed
                        except Exception:
                            pass
            return None
        except Exception as e:
            print(f"[RecEngine] Gradio API {api_name} error: {e}")
            return None

    # ── Synchronous Gradio Call (for non-async contexts) ──

    def _call_gradio_api_sync(self, api_name: str, data: dict) -> Any:
        """
        Synchronous version of _call_gradio_api for use in non-async contexts.
        Uses httpx.Client instead of AsyncClient.
        """
        import json
        url = f"{self.gradio_url}/call/{api_name}"
        headers = self._get_headers()
        try:
            with httpx.Client(timeout=30.0) as client:
                payload = {"data": list(data.values())}

                # Step 1: Submit the prediction
                resp = client.post(url, json=payload, headers=headers)
                if resp.status_code != 200:
                    print(f"[RecEngine] Gradio API {api_name} returned status {resp.status_code}: {resp.text}")
                    return None

                result = resp.json()
                if "event_id" not in result:
                    if "data" in result:
                        return result["data"][0] if isinstance(result["data"], list) and len(result["data"]) > 0 else result["data"]
                    return None

                # Step 2: Fetch the result via SSE stream
                event_id = result["event_id"]
                result_url = f"{self.gradio_url}/call/{api_name}/{event_id}"
                result_resp = client.get(result_url, headers=headers)
                if result_resp.status_code == 200:
                    text = result_resp.text
                    current_event = None
                    for line in text.split("\n"):
                        line_str = line.strip()
                        if line_str.startswith("event: "):
                            current_event = line_str[7:].strip()
                        elif line_str.startswith("data: "):
                            data_str = line_str[6:].strip()
                            if data_str == "null":
                                continue
                            try:
                                parsed = json.loads(data_str)
                                if current_event == "complete" or current_event is None:
                                    if isinstance(parsed, list) and len(parsed) > 0:
                                        return parsed[0]
                                    if parsed is not None:
                                        return parsed
                            except Exception:
                                pass
                return None
        except Exception as e:
            print(f"[RecEngine] Gradio API {api_name} sync error: {e}")
            return None

    # ── TTL Cache Methods ──────────────────────

    def get_ttl_excluded_titles(self, user_id: Optional[str]) -> set:
        """Returns non-expired song titles/identifiers cached for this user within the last 120s."""
        if not user_id:
            return set()

        now = time.time()
        user_dict = self.ttl_cache.get(user_id, {})
        if not user_dict:
            return set()

        active = {}
        for song_key, expiry in user_dict.items():
            if expiry > now:
                active[song_key] = expiry
        self.ttl_cache[user_id] = active

        return set(active.keys())

    def add_ttl_served_tracks(self, user_id: Optional[str], tracks: List[Dict[str, Any]]):
        """Caches served recommendation tracks for 45 seconds for the given user."""
        if not user_id:
            return

        now = time.time()
        expiry = now + self.ttl_seconds
        if user_id not in self.ttl_cache:
            self.ttl_cache[user_id] = {}

        for item in (tracks or []):
            title = item.get("title", "").strip().lower()
            tr_str = item.get("track_id_str", "").strip().lower()
            if title:
                self.ttl_cache[user_id][title] = expiry
            if tr_str:
                self.ttl_cache[user_id][tr_str] = expiry

    # ── Initialization ─────────────────────────

    def initialize(self):
        if self.is_initialized:
            return

        print(f"[RecEngine] Initializing lightweight Recommendation Engine (no local ML models)")

        # Connect to Qdrant Vector DB
        q_url = getattr(settings, "QDRANT_URL", None) or os.getenv("QDRANT_URL")
        q_key = getattr(settings, "QDRANT_API_KEY", None) or os.getenv("QDRANT_API_KEY")

        if not q_url or "your-qdrant" in q_url:
            q_url = os.getenv("QDRANT_URL")
        if not q_key or "your-" in q_key:
            q_key = os.getenv("QDRANT_API_KEY")

        if q_url and "your-qdrant" not in q_url:
            try:
                api_k = q_key if (q_key and "your-" not in q_key) else None
                self.qdrant_client = QdrantClient(url=q_url, api_key=api_k, check_compatibility=False)
                print(f"[RecEngine] Connected to Qdrant Vector DB at {q_url}")

                col_name = "groove4u_items"
                try:
                    self.qdrant_client.create_payload_index(
                        collection_name=col_name,
                        field_name="artist",
                        field_schema=qmodels.PayloadSchemaType.KEYWORD
                    )
                except Exception:
                    pass
                try:
                    self.qdrant_client.create_payload_index(
                        collection_name=col_name,
                        field_name="genre",
                        field_schema=qmodels.PayloadSchemaType.KEYWORD
                    )
                except Exception:
                    pass
            except Exception as e:
                print(f"[RecEngine] Qdrant connection notice: {e}")

        print(f"[RecEngine] Gradio Space URL: {self.gradio_url}")
        self.is_initialized = True
        print("[RecEngine] Initialization complete!")

    # ── 1. Generate User Vector (via Gradio) ───

    def generate_user_vector(
        self,
        user_id: str,
        taste_ratings: List[Dict[str, Any]],
        top_genres: List[str],
        top_artists: List[str]
    ) -> np.ndarray:
        """
        Calls the Gradio Space to generate a 128-dim user vector via UserTower.
        Falls back to a zero vector if the Space is unreachable.
        """
        self.initialize()

        if top_artists is None:
            top_artists = []
        if top_genres is None:
            top_genres = []

        import json
        data = {
            "user_id": user_id,
            "taste_ratings": json.dumps(taste_ratings or []),
            "top_genres": json.dumps(top_genres or []),
            "top_artists": json.dumps(top_artists or [])
        }

        vec_list = self._call_gradio_api_sync("generate_user_vector", data)

        if vec_list is not None and isinstance(vec_list, list) and len(vec_list) == 128:
            vec = np.array(vec_list, dtype=np.float32)
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            return vec

        # Fallback vector (128-dim)
        print("[RecEngine] Gradio generate_user_vector failed, using fallback vector")
        vec = np.zeros(128, dtype=np.float32)
        vec[0] = 1.0
        return vec

    # ── 2. Retrieve Candidates from Qdrant ─────

    def retrieve_candidates_qdrant(
        self,
        user_vector: np.ndarray,
        top_k: int = 500,
        top_artists: Optional[List[str]] = None,
        top_genres: Optional[List[str]] = None,
        exclude_titles: Optional[set] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieves 500 total candidate tracks:
        - 70 reserved for top artists (split evenly among top artists)
        - 30 reserved for top genres (split evenly among top genres)
        - 400 via Two-Tower Vector search in Qdrant
        - Hard eliminates any songs currently in the user's taste profile.
        Fallback catalog search is now done via Gradio Space.
        """
        self.initialize()
        candidates = []
        seen_track_ids = set()
        exclude_set = {t.strip().lower() for t in (exclude_titles or []) if t}

        def is_excluded(title: str, tr_str: str) -> bool:
            t_clean = (title or "").strip().lower()
            str_clean = (tr_str or "").strip().lower()
            return t_clean in exclude_set or str_clean in exclude_set

        def add_candidate(track_id: str, tr_str: str, title: str, artist: str, genre: str, score: float):
            clean_id = str(track_id or tr_str)
            if clean_id in seen_track_ids or is_excluded(title, tr_str):
                return False
            seen_track_ids.add(clean_id)
            candidates.append({
                "track_id": clean_id,
                "track_id_str": tr_str,
                "score": float(score),
                "artist": artist or "Various Artists",
                "genre": genre or "Pop",
                "title": title or (tr_str.split("—")[0].strip() if "—" in tr_str else tr_str)
            })
            return True

        clean_top_artists = [a for a in (top_artists or []) if a and str(a).strip()]
        clean_top_genres = [g for g in (top_genres or []) if g and str(g).strip()]

        col_name = "groove4u_items"

        # Pre-fetch vector search pool for fallback client-side filtering
        qdrant_pool = []
        if self.qdrant_client is not None:
            try:
                if hasattr(self.qdrant_client, "query_points"):
                    res_obj = self.qdrant_client.query_points(
                        collection_name=col_name,
                        query=user_vector.tolist(),
                        limit=500
                    )
                    qdrant_pool = res_obj.points if hasattr(res_obj, "points") else res_obj
                else:
                    qdrant_pool = self.qdrant_client.search(
                        collection_name=col_name,
                        query_vector=user_vector.tolist(),
                        limit=500
                    )
            except Exception as e:
                print(f"[RecEngine] Qdrant pool fetch notice: {e}")

        # --- 1. Reserve 70 candidates for Top Artists ---
        artist_quota_total = 70
        if clean_top_artists and self.qdrant_client is not None:
            per_artist_k = max(1, artist_quota_total // len(clean_top_artists))
            for artist_name in clean_top_artists:
                added_count = 0
                try:
                    filt = qmodels.Filter(
                        must=[qmodels.FieldCondition(key="artist", match=qmodels.MatchValue(value=artist_name))]
                    )
                    if hasattr(self.qdrant_client, "query_points"):
                        res_obj = self.qdrant_client.query_points(
                            collection_name=col_name,
                            query=user_vector.tolist(),
                            query_filter=filt,
                            limit=per_artist_k
                        )
                        pts = res_obj.points if hasattr(res_obj, "points") else res_obj
                    else:
                        pts = self.qdrant_client.search(
                            collection_name=col_name,
                            query_vector=user_vector.tolist(),
                            query_filter=filt,
                            limit=per_artist_k
                        )
                    for res in pts:
                        payload = getattr(res, "payload", {}) or {}
                        r_title = payload.get("track") or payload.get("title") or ""
                        r_artist = payload.get("artist") or artist_name
                        r_tr_str = payload.get("track_id") or payload.get("track_id_str") or f"{r_title} — {r_artist}"
                        raw_s = float(getattr(res, "score", 0.0))
                        if add_candidate(getattr(res, "id", r_tr_str), r_tr_str, r_title, r_artist, payload.get("genre", ""), raw_s):
                            added_count += 1
                except Exception as e:
                    print(f"[RecEngine] Index missing or search error for artist '{artist_name}', using client-side filter fallback: {e}")

                # Client-side fallback if Qdrant payload index is missing
                if added_count < per_artist_k and qdrant_pool:
                    a_lower = artist_name.strip().lower()
                    for res in qdrant_pool:
                        payload = getattr(res, "payload", {}) or {}
                        r_artist = str(payload.get("artist") or "").strip().lower()
                        if a_lower in r_artist or r_artist in a_lower:
                            r_title = payload.get("track") or payload.get("title") or ""
                            r_tr_str = payload.get("track_id") or payload.get("track_id_str") or f"{r_title} — {payload.get('artist')}"
                            raw_s = float(getattr(res, "score", 0.0))
                            if add_candidate(getattr(res, "id", r_tr_str), r_tr_str, r_title, payload.get("artist") or artist_name, payload.get("genre", ""), raw_s):
                                added_count += 1
                                if added_count >= per_artist_k:
                                    break

        # --- 2. Reserve 30 candidates for Top Genres ---
        genre_quota_total = 30
        if clean_top_genres and self.qdrant_client is not None:
            per_genre_k = max(1, genre_quota_total // len(clean_top_genres))
            for genre_name in clean_top_genres:
                added_count = 0
                try:
                    filt = qmodels.Filter(
                        must=[qmodels.FieldCondition(key="genre", match=qmodels.MatchValue(value=genre_name))]
                    )
                    if hasattr(self.qdrant_client, "query_points"):
                        res_obj = self.qdrant_client.query_points(
                            collection_name=col_name,
                            query=user_vector.tolist(),
                            query_filter=filt,
                            limit=per_genre_k
                        )
                        pts = res_obj.points if hasattr(res_obj, "points") else res_obj
                    else:
                        pts = self.qdrant_client.search(
                            collection_name=col_name,
                            query_vector=user_vector.tolist(),
                            query_filter=filt,
                            limit=per_genre_k
                        )
                    for res in pts:
                        payload = getattr(res, "payload", {}) or {}
                        r_title = payload.get("track") or payload.get("title") or ""
                        r_artist = payload.get("artist") or ""
                        r_tr_str = payload.get("track_id") or payload.get("track_id_str") or f"{r_title} — {r_artist}"
                        raw_s = float(getattr(res, "score", 0.0))
                        if add_candidate(getattr(res, "id", r_tr_str), r_tr_str, r_title, r_artist, payload.get("genre", genre_name), raw_s):
                            added_count += 1
                except Exception as e:
                    print(f"[RecEngine] Index missing or search error for genre '{genre_name}', using client-side filter fallback: {e}")

                # Client-side fallback if Qdrant payload index is missing
                if added_count < per_genre_k and qdrant_pool:
                    g_lower = genre_name.strip().lower()
                    for res in qdrant_pool:
                        payload = getattr(res, "payload", {}) or {}
                        r_genre = str(payload.get("genre") or "").strip().lower()
                        if g_lower in r_genre or r_genre in g_lower:
                            r_title = payload.get("track") or payload.get("title") or ""
                            r_artist = payload.get("artist") or ""
                            r_tr_str = payload.get("track_id") or payload.get("track_id_str") or f"{r_title} — {r_artist}"
                            raw_s = float(getattr(res, "score", 0.0))
                            if add_candidate(getattr(res, "id", r_tr_str), r_tr_str, r_title, r_artist, payload.get("genre", genre_name), raw_s):
                                added_count += 1
                                if added_count >= per_genre_k:
                                    break

        # --- 3. Reserve remaining (~400) via Two-Tower Vector Search ---
        for res in qdrant_pool:
            payload = getattr(res, "payload", {}) or {}
            raw_title = payload.get("track") or payload.get("title") or ""
            raw_artist = payload.get("artist") or ""
            raw_tr_str = payload.get("track_id") or payload.get("track_id_str") or f"{raw_title} — {raw_artist}"
            score_val = float(getattr(res, "score", 0.0))

            add_candidate(getattr(res, "id", raw_tr_str), raw_tr_str, raw_title, raw_artist, payload.get("genre", ""), score_val)
            if len(candidates) >= top_k:
                break

        # --- Fallback catalog search via Gradio Space if Qdrant is offline ---
        if len(candidates) < top_k:
            import json
            data = {
                "user_vector": json.dumps(user_vector.tolist()),
                "top_k": top_k,
                "exclude_titles": json.dumps(list(exclude_set))
            }
            fallback_cands = self._call_gradio_api_sync("fallback_catalog_search", data)
            if fallback_cands and isinstance(fallback_cands, list):
                for item in fallback_cands:
                    if len(candidates) >= top_k:
                        break
                    add_candidate(
                        item.get("track_id", ""),
                        item.get("track_id_str", ""),
                        item.get("title", ""),
                        item.get("artist", ""),
                        item.get("genre", "Pop"),
                        float(item.get("score", 0.0))
                    )

        return candidates[:top_k]

    # ── 3. Rank Candidates (via Gradio LGBM) ───

    def rank_candidates_lgbm(
        self,
        user_id: str,
        user_vector: np.ndarray,
        candidates: List[Dict[str, Any]],
        taste_ratings: List[Dict[str, Any]],
        top_artists: List[str],
        top_genres: Optional[List[str]] = None,
        exclude_titles: Optional[set] = None,
        top_n: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Ranks candidates using LightGBM LambdaMART ranker via Gradio Space.
        Falls back to score-based sorting if the Space is unreachable.
        """
        self.initialize()

        valid_candidates = list(candidates or [])
        if not valid_candidates:
            return []

        import json
        data = {
            "candidates": json.dumps(valid_candidates),
            "top_artists": json.dumps(top_artists or []),
            "top_genres": json.dumps(top_genres or []),
            "top_n": top_n
        }

        ranked = self._call_gradio_api_sync("rank_candidates", data)

        if ranked is not None and isinstance(ranked, list) and len(ranked) > 0:
            return ranked

        # Fallback: sort by score
        print("[RecEngine] Gradio rank_candidates failed, using score-based fallback")
        sorted_cands = sorted(valid_candidates, key=lambda x: x.get("score", 0), reverse=True)
        return sorted_cands[:top_n]

    # ── 4. Diversity Reranking (local, pure Python) ──

    def rerank_diversity(
        self,
        ranked_candidates: List[Dict[str, Any]],
        target_k: int = 5,
        exclude_titles: Optional[set] = None,
        user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Reranks top candidates to select target_k non-taste-profile recommendations.
        - Deletes/skips any song already in the user's taste profile OR served to this user in the last 45s (TTL cache).
        - Artist capping:
            * Max 3 songs per artist if K is 8 to 10
            * Max 2 songs per artist if K is 5 to 7
            * Max 1 song per artist if K < 5
        - Starts with Top 50 pool. If < K songs gathered, expands pool by 20 songs iteratively.
        """
        exclude_set = {t.strip().lower() for t in (exclude_titles or []) if t}
        if user_id:
            ttl_set = self.get_ttl_excluded_titles(user_id)
            exclude_set = exclude_set.union(ttl_set)

        try:
            k_val = int(target_k)
        except Exception:
            k_val = 5

        if k_val >= 8:
            max_artist_cap = 3
        elif k_val >= 5:
            max_artist_cap = 2
        else:
            max_artist_cap = 1

        final_recs = []
        artist_counts = {}
        processed_ids = set()

        total_candidates = len(ranked_candidates or [])
        current_pool_limit = 50

        idx = 0
        while len(final_recs) < k_val and idx < total_candidates:
            # If current pool limit exhausted and still need more songs, expand pool by 20
            if idx >= current_pool_limit and len(final_recs) < k_val:
                current_pool_limit = min(total_candidates, current_pool_limit + 20)

            if idx >= current_pool_limit:
                break

            item = ranked_candidates[idx]
            idx += 1

            cand_id = item.get("qdrant_point_id") or item.get("track_id") or item.get("track_id_str")
            if cand_id in processed_ids:
                continue
            processed_ids.add(cand_id)

            title = item.get("title", "").strip().lower()
            tr_str = item.get("track_id_str", "").strip().lower()

            # Taste Profile & TTL Cache Deletion: Delete/skip any song in taste profile or active 45s TTL cache
            if title in exclude_set or tr_str in exclude_set:
                continue

            artist = item.get("artist", "Various Artists").strip().lower()
            if not artist or artist == "various artists":
                final_recs.append(item)
                continue

            current_count = artist_counts.get(artist, 0)
            if current_count < max_artist_cap:
                final_recs.append(item)
                artist_counts[artist] = current_count + 1

        # Cache the served tracks for 45 seconds to guarantee fresh tracks on immediate repeat requests
        if user_id and final_recs:
            self.add_ttl_served_tracks(user_id, final_recs)

        return final_recs

    # ── 5. Embed New Track (via Gradio ItemTower) ──

    def embed_new_track(self, title: str, artist: str, tags: List[str], genre: Optional[str] = None) -> np.ndarray:
        """
        Calls the Gradio Space to embed a new/custom track using ItemTower.
        Returns a normalized 128-dimensional embedding vector.
        """
        self.initialize()

        import json
        data = {
            "title": title,
            "artist": artist,
            "tags": json.dumps(tags or []),
            "genre": genre or ""
        }

        vec_list = self._call_gradio_api_sync("embed_new_track", data)

        if vec_list is not None and isinstance(vec_list, list) and len(vec_list) == 128:
            vec = np.array(vec_list, dtype=np.float32)
            norm = np.linalg.norm(vec)
            if norm > 0:
                return vec / norm
            return vec

        # Normalized fallback vector (128-dim)
        print("[RecEngine] Gradio embed_new_track failed, using fallback vector")
        vec = np.zeros(128, dtype=np.float32)
        vec[0] = 1.0
        return vec

    # ── 6. Search Artist Tracks (via Gradio item_meta) ──

    def search_artist_tracks(
        self,
        artist_name: str,
        limit: int = 5,
        exclude_titles: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Calls the Gradio Space to search item_meta for tracks by a given artist.
        Used in cold-start pipeline Tier A.
        """
        self.initialize()

        import json
        data = {
            "artist_name": artist_name,
            "limit": limit,
            "exclude_titles": json.dumps(exclude_titles or [])
        }

        tracks = self._call_gradio_api_sync("search_artist_tracks", data)

        if tracks is not None and isinstance(tracks, list):
            return tracks

        print("[RecEngine] Gradio search_artist_tracks failed, returning empty list")
        return []


recommendation_engine = RecommendationEngineService()