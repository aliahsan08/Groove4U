import os
import pickle
import joblib
import torch
import torch.nn as nn
import numpy as np
import pandas as pd
import lightgbm as lgb
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from app.config import settings


class UserTower(nn.Module):
    def __init__(self, num_users=2431, num_tags=26913, num_tracks=90383, embed_dim=64, tag_dim=128, output_dim=128):
        super().__init__()
        self.user_embedding = nn.Embedding(num_users, embed_dim)
        self.tag_embedding = nn.EmbeddingBag(num_tags, tag_dim, mode='sum')
        self.track_history = nn.EmbeddingBag(num_tracks, embed_dim, mode='sum')

        input_dim = embed_dim + tag_dim + embed_dim
        self.dnn = nn.Sequential(
            nn.Linear(input_dim, 256),
            nn.ReLU(),
            nn.LayerNorm(256),
            nn.Linear(256, output_dim)
        )

    def forward(self, user_idx, tag_indices, tag_offsets=None, tag_weights=None, hist_idx=None, hist_off=None, hist_w=None):
        device = user_idx.device if user_idx is not None else (tag_indices.device if tag_indices is not None else 'cpu')
        batch_size = user_idx.size(0) if user_idx is not None else 1

        if user_idx is None:
            u_emb = torch.zeros((batch_size, 64), device=device)
        else:
            u_emb = self.user_embedding(user_idx)

        if tag_indices is not None and tag_indices.numel() > 0:
            if tag_indices.dim() == 2:
                tag_indices = tag_indices.reshape(-1)
            if tag_weights is not None and tag_weights.dim() == 2:
                tag_weights = tag_weights.reshape(-1)
            if tag_offsets is None:
                tag_offsets = torch.tensor([0], dtype=torch.long, device=device)
            t_emb = self.tag_embedding(tag_indices, tag_offsets, per_sample_weights=tag_weights)
            if t_emb.dim() == 1:
                t_emb = t_emb.unsqueeze(0)
        else:
            t_emb = torch.zeros((batch_size, 128), device=device)

        if hist_idx is not None and hist_idx.numel() > 0:
            if hist_idx.dim() == 2:
                hist_idx = hist_idx.reshape(-1)
            if hist_w is not None and hist_w.dim() == 2:
                hist_w = hist_w.reshape(-1)
            if hist_off is None:
                hist_off = torch.tensor([0], dtype=torch.long, device=device)
            h_emb = self.track_history(hist_idx, hist_off, per_sample_weights=hist_w)
            if h_emb.dim() == 1:
                h_emb = h_emb.unsqueeze(0)
        else:
            h_emb = torch.zeros((batch_size, 64), device=device)

        x = torch.cat([u_emb, t_emb, h_emb], dim=-1)
        import torch.nn.functional as F
        return F.normalize(self.dnn(x), p=2, dim=1)


class ItemTower(nn.Module):
    def __init__(self, num_tracks=90383, num_tags=26913, text_dim=384, embed_dim=64, tag_dim=128, output_dim=128):
        super().__init__()
        self.track_embedding = nn.Embedding(num_tracks, embed_dim)
        self.tag_embedding = nn.EmbeddingBag(num_tags, tag_dim, mode='sum')

        input_dim = embed_dim + tag_dim + text_dim
        self.dnn = nn.Sequential(
            nn.Linear(input_dim, 256),
            nn.ReLU(),
            nn.LayerNorm(256),
            nn.Linear(256, output_dim)
        )

    def forward(self, track_idx, tag_indices, tag_offsets=None, tag_weights=None, text_emb=None):
        device = track_idx.device if track_idx is not None else (text_emb.device if text_emb is not None else 'cpu')
        batch_size = track_idx.size(0) if track_idx is not None else 1

        if track_idx is None:
            t_emb = torch.zeros((batch_size, 64), device=device)
        else:
            t_emb = self.track_embedding(track_idx)

        if tag_indices is not None and tag_indices.numel() > 0:
            if tag_indices.dim() == 2:
                tag_indices = tag_indices.reshape(-1)
            if tag_offsets is None:
                tag_offsets = torch.tensor([0], dtype=torch.long, device=device)
            tag_emb = self.tag_embedding(tag_indices, tag_offsets, per_sample_weights=tag_weights)
            if tag_emb.dim() == 1:
                tag_emb = tag_emb.unsqueeze(0)
        else:
            tag_emb = torch.zeros((batch_size, 128), device=device)

        if text_emb is None:
            text_emb = torch.zeros((batch_size, 384), device=device)

        x = torch.cat([t_emb, tag_emb, text_emb], dim=-1)
        import torch.nn.functional as F
        return F.normalize(self.dnn(x), p=2, dim=1)


class RecommendationEngineService:
    def __init__(self):
        curr_dir = os.path.dirname(os.path.abspath(__file__)) # app/services
        backend_dir = os.path.dirname(os.path.dirname(curr_dir)) # backend
        project_root = os.path.dirname(backend_dir) # project root

        possible_dirs = [
            os.path.join(project_root, "models"),
            os.path.join(backend_dir, "models"),
            os.path.join(curr_dir, "models")
        ]

        self.models_dir = possible_dirs[0]
        for d in possible_dirs:
            if os.path.exists(os.path.join(d, "Two Tower NN")):
                self.models_dir = d
                break

        self.is_initialized = False

        self.user_tower = None
        self.item_tower = None
        self.lgbm_ranker = None

        self.user2idx = {}
        self.track2idx = {}
        self.idx2track = {}
        self.tag2idx = {}
        self.item_meta = None
        self.reranker_artifacts = {}

        self.qdrant_client = None

        # 120-second TTL cache to prevent repeating recommendations when user generates within 120s
        self.ttl_cache = {}  # { user_id: { track_identifier_lower: expiry_timestamp } }
        self.ttl_seconds = 120.0

    def get_ttl_excluded_titles(self, user_id: Optional[str]) -> set:
        """Returns non-expired song titles/identifiers cached for this user within the last 120s."""
        if not user_id:
            return set()

        import time
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

        import time
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

    def initialize(self):
        if self.is_initialized:
            return

        print(f"[RecEngine] Initializing Recommendation Engine from models_dir: {self.models_dir}")

        two_tower_dir = os.path.join(self.models_dir, "Two Tower NN")
        ranker_dir = os.path.join(self.models_dir, "Ranker")

        mappings_path = os.path.join(two_tower_dir, "mappings.pkl")
        if os.path.exists(mappings_path):
            try:
                with open(mappings_path, "rb") as f:
                    mp = pickle.load(f)
                self.user2idx = mp.get("user2idx", {})
                self.track2idx = mp.get("track2idx", {})
                self.tag2idx = mp.get("tag2idx", {})
                self.idx2track = mp.get("idx2track", {})
            except Exception as e:
                print(f"[RecEngine] Notice loading mappings.pkl: {e}")

        meta_path = os.path.join(two_tower_dir, "item_meta.pkl")
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "rb") as f:
                    self.item_meta = pickle.load(f)
            except Exception as e:
                print(f"[RecEngine] Notice loading item_meta.pkl: {e}")

        user_pth = os.path.join(two_tower_dir, "user_tower.pth")
        if os.path.exists(user_pth):
            try:
                num_u = max(len(self.user2idx), 2431)
                num_t = max(len(self.tag2idx), 26913)
                self.user_tower = UserTower(num_users=num_u, num_tags=num_t)
                self.user_tower.load_state_dict(torch.load(user_pth, map_location="cpu"))
                self.user_tower.eval()
            except Exception as e:
                print(f"[RecEngine] Notice loading user_tower.pth: {e}")

        item_pth = os.path.join(two_tower_dir, "item_tower.pth")
        if os.path.exists(item_pth):
            try:
                num_tr = max(len(self.track2idx), 90383)
                num_t = max(len(self.tag2idx), 26913)
                self.item_tower = ItemTower(num_tracks=num_tr, num_tags=num_t)
                self.item_tower.load_state_dict(torch.load(item_pth, map_location="cpu"))
                self.item_tower.eval()
            except Exception as e:
                print(f"[RecEngine] Notice loading item_tower.pth: {e}")

        lgbm_path = os.path.join(ranker_dir, "lgbm_reranker.txt")
        if os.path.exists(lgbm_path):
            try:
                self.lgbm_ranker = lgb.Booster(model_file=lgbm_path)
            except Exception as e:
                print(f"[RecEngine] Notice loading lgbm_reranker.txt: {e}")

        art_path = os.path.join(ranker_dir, "reranker_artifacts.joblib")
        if os.path.exists(art_path):
            try:
                self.reranker_artifacts = joblib.load(art_path)
            except Exception as e:
                print(f"[RecEngine] Notice loading reranker_artifacts.joblib: {e}")

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

        self.is_initialized = True
        print("[RecEngine] Initialization complete!")

    def generate_user_vector(
        self,
        user_id: str,
        taste_ratings: List[Dict[str, Any]],
        top_genres: List[str],
        top_artists: List[str]
    ) -> np.ndarray:
        self.initialize()

        if top_artists is None:
            top_artists = []
        if top_genres is None:
            top_genres = []

        tag_indices_list = []
        weights_list = []

        # Taste Profile Weighting:
        # Rating 0 to 5 -> weight = 0 (ignored/skipped)
        # Rating 5 to 10 -> linear scale: 5 is 0.0, 10 is 1.0 (weight = (rating - 5.0) / 5.0)
        for item in (taste_ratings or []):
            rating = float(item.get("rating", 0))
            if rating >= 5.0:
                weight = (rating - 5.0) / 5.0
            else:
                weight = 0.0

            if weight > 0.0:
                genre = str(item.get("genre", "")).strip().lower()
                if genre and genre in self.tag2idx:
                    tag_indices_list.append(self.tag2idx[genre])
                    weights_list.append(weight)

        for g in top_genres:
            g_clean = str(g).strip().lower()
            if g_clean in self.tag2idx:
                tag_indices_list.append(self.tag2idx[g_clean])
                weights_list.append(1.0)

        for a in top_artists:
            a_clean = str(a).strip().lower()
            if a_clean in self.tag2idx:
                tag_indices_list.append(self.tag2idx[a_clean])
                weights_list.append(1.0)

        u_idx_val = self.user2idx.get(user_id, None)

        with torch.no_grad():
            if self.user_tower is not None:
                if u_idx_val is not None:
                    u_tensor = torch.tensor([u_idx_val], dtype=torch.long)
                else:
                    u_tensor = None

                if tag_indices_list:
                    t_tensor = torch.tensor([tag_indices_list], dtype=torch.long)
                    w_tensor = torch.tensor([weights_list], dtype=torch.float32)
                else:
                    t_tensor = None
                    w_tensor = None

                out = self.user_tower(u_tensor, tag_indices=t_tensor, tag_weights=w_tensor)
                vec = out.detach().cpu().numpy().flatten()
                norm = np.linalg.norm(vec)
                if norm > 0:
                    vec = vec / norm
                return vec

        # Fallback vector (128-dim)
        vec = np.zeros(128, dtype=np.float32)
        vec[0] = 1.0
        return vec

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
        - 400 via Two-Tower Vector search in Qdrant / catalog
        - Hard eliminates any songs currently in the user's taste profile.
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

        # Pre-fetch vector search pool for fallback client-side filtering if Qdrant indexes are absent
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

        # --- Fallback catalog search if Qdrant is offline or returned insufficient candidates ---
        if len(candidates) < top_k and self.reranker_artifacts:
            item_embs = self.reranker_artifacts.get("item_embs")
            track_to_artist = self.reranker_artifacts.get("track_to_artist", {})
            if item_embs is not None:
                sims = np.dot(item_embs, user_vector)
                top_indices = np.argsort(-sims)
                for idx in top_indices:
                    t_str = self.idx2track.get(idx, f"Track #{idx}")
                    artist_name = track_to_artist.get(idx, "")
                    t_title = t_str.split("—")[0].strip() if "—" in t_str else t_str
                    add_candidate(str(idx), t_str, t_title, artist_name, "Pop", float(sims[idx]))
                    if len(candidates) >= top_k:
                        break

        return candidates[:top_k]

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
        Ranks candidates using LightGBM LambdaMART ranker.
        Keeps all candidates intact without premature deletion during ranking.
        """
        self.initialize()

        valid_candidates = list(candidates or [])
        if not valid_candidates:
            return []

        if self.lgbm_ranker is None:
            sorted_cands = sorted(valid_candidates, key=lambda x: x.get("score", 0), reverse=True)
            return sorted_cands[:top_n]

        try:
            top_artists_lower = {a.lower() for a in (top_artists or [])}
            top_genres_lower = {g.lower() for g in (top_genres or [])}

            features_list = []
            for item in valid_candidates:
                sim_score = float(item.get("score", 0.0))
                art_name = item.get("artist", "").lower()
                gen_name = item.get("genre", "").lower()

                is_fav_artist = 1.0 if art_name in top_artists_lower else 0.0
                is_fav_genre = 1.0 if gen_name in top_genres_lower else 0.0

                feat = [
                    sim_score,
                    is_fav_artist,
                    is_fav_genre,
                    0.5, 0.5, 0.5, 0.5, 0.5
                ]
                features_list.append(feat)

            feats_arr = np.array(features_list, dtype=np.float32)
            preds = self.lgbm_ranker.predict(feats_arr)

            for i, cand in enumerate(valid_candidates):
                cand["rank_score"] = float(preds[i])

            ranked = sorted(valid_candidates, key=lambda x: x.get("rank_score", 0), reverse=True)
            return ranked[:top_n]
        except Exception as e:
            print(f"[RecEngine] LGBM ranking notice: {e}")
            sorted_cands = sorted(valid_candidates, key=lambda x: x.get("score", 0), reverse=True)
            return sorted_cands[:top_n]

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

    def embed_new_track(self, title: str, artist: str, tags: List[str], genre: Optional[str] = None) -> np.ndarray:
        """
        Embeds a new/custom track using PyTorch ItemTower with tag & artist indices.
        Returns a normalized 128-dimensional embedding vector.
        """
        self.initialize()

        tag_indices_list = []
        if tags:
            for t in tags:
                t_clean = str(t).strip().lower()
                if t_clean in self.tag2idx:
                    tag_indices_list.append(self.tag2idx[t_clean])

        if genre:
            g_clean = str(genre).strip().lower()
            if g_clean in self.tag2idx and self.tag2idx[g_clean] not in tag_indices_list:
                tag_indices_list.append(self.tag2idx[g_clean])

        a_clean = str(artist).strip().lower()
        if a_clean in self.tag2idx and self.tag2idx[a_clean] not in tag_indices_list:
            tag_indices_list.append(self.tag2idx[a_clean])

        with torch.no_grad():
            if self.item_tower is not None and tag_indices_list:
                t_tensor = torch.tensor([tag_indices_list], dtype=torch.long)
                out = self.item_tower(track_idx=None, tag_indices=t_tensor)
                vec = out.detach().cpu().numpy().flatten()
                norm = np.linalg.norm(vec)
                if norm > 0:
                    return vec / norm
                return vec

        # Normalized fallback vector (128-dim)
        vec = np.zeros(128, dtype=np.float32)
        vec[0] = 1.0
        return vec


recommendation_engine = RecommendationEngineService()

