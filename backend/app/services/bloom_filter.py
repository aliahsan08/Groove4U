import zlib
import hashlib
import pickle
import os
import re
from typing import List, Set

class TrackBloomFilter:
    """
    High-performance Bloom Filter data structure for instant O(1) membership testing 
    of track strings ("Song — Artist") across the 90,383 catalog tracks.
    Includes fast prefix search for real-time frontend autocomplete.
    """
    def __init__(self, size: int = 1500000, num_hashes: int = 4):
        self.size = size
        self.num_hashes = num_hashes
        self.bitset = 0  # Large integer bitset
        self.exact_set: Set[str] = set()
        self.catalog_list: List[str] = []
        self._is_loaded = False

    def _get_hashes(self, item: str) -> List[int]:
        normalized = item.strip().lower()
        encoded = normalized.encode('utf-8')
        
        # 1. CRC32
        h1 = zlib.crc32(encoded)
        # 2. SHA256 double-hash simulation (Kirsch-Mitzenmacher optimization)
        h2 = int(hashlib.sha256(encoded).hexdigest()[:8], 16)
        
        hashes = []
        for i in range(self.num_hashes):
            combined_hash = (h1 + i * h2) % self.size
            hashes.append(combined_hash)
        return hashes

    def add(self, item: str):
        if not item:
            return
        normalized = item.strip().lower()
        for pos in self._get_hashes(normalized):
            self.bitset |= (1 << pos)
        self.exact_set.add(normalized)

    def contains(self, item: str) -> bool:
        if not item or not self._is_loaded:
            return False
        normalized = item.strip().lower()
        
        # 1. Check Bloom Filter bits
        for pos in self._get_hashes(normalized):
            if not (self.bitset & (1 << pos)):
                return False
        
        # 2. Confirm with exact set (eliminates any Bloom false positives)
        return normalized in self.exact_set

    def load_catalog(self, mappings_path: str = None):
        if self._is_loaded:
            return

        if mappings_path is None:
            # Resolve relative path to models/Two Tower NN/mappings.pkl
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
            mappings_path = os.path.join(base_dir, 'models', 'Two Tower NN', 'mappings.pkl')

        print(f"[BloomFilter] Loading catalog from: {mappings_path}")
        if os.path.exists(mappings_path):
            try:
                with open(mappings_path, 'rb') as f:
                    mappings = pickle.load(f)
                    tracks_dict = mappings.get('track2idx', {}) or mappings.get('idx2track', {})
                    
                    if isinstance(tracks_dict, dict):
                        track_keys = list(tracks_dict.keys()) if isinstance(list(tracks_dict.keys())[0], str) else list(tracks_dict.values())
                    else:
                        track_keys = []

                    for track_str in track_keys:
                        if isinstance(track_str, str):
                            self.add(track_str)
                            self.catalog_list.append(track_str)

                print(f"[BloomFilter] Successfully loaded {len(self.exact_set)} unique catalog track IDs into Bloom Filter.")
                self._is_loaded = True
            except Exception as e:
                print(f"[BloomFilter] Error loading catalog pickle: {e}")
        else:
            print(f"[BloomFilter] Mappings pickle file not found at {mappings_path}")

    def search_autocomplete(self, query: str, limit: int = 10) -> List[str]:
        if not query or len(query.strip()) < 2:
            return []
        
        q_clean = re.sub(r'[^\w\s]', '', query.lower()).strip()
        q_tokens = q_clean.split()
        if not q_tokens:
            return []

        results = []
        
        # 1. Exact string containment check
        for track in self.catalog_list:
            track_lower = track.lower()
            if query.strip().lower() in track_lower:
                results.append(track)
                if len(results) >= limit:
                    return results

        # 2. Tokenized word-set check (handles missing em-dash, hyphens, etc.)
        for track in self.catalog_list:
            if track in results:
                continue
            track_clean = re.sub(r'[^\w\s]', '', track.lower())
            if all(token in track_clean for token in q_tokens):
                results.append(track)
                if len(results) >= limit:
                    break

        return results

# Singleton instance
bloom_filter_service = TrackBloomFilter()
