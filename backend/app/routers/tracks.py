from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
from app.database import supabase
from app.auth import get_current_user
from app.schemas.track import TrackCreate, TrackResponse

router = APIRouter(prefix="/api/tracks", tags=["Tracks Catalog"])

@router.get("", response_model=List[TrackResponse])
async def list_tracks(
    search: Optional[str] = Query(None, description="Search by title or artist"),
    limit: int = Query(50, ge=1, le=200)
):
    query = supabase.table("tracks").select(
        "track_id, qdrant_point_id, title, artist_id, genre_id, artists(artist_name), genres(genre_name)"
    ).limit(limit)

    if search:
        query = query.ilike("title", f"%{search}%")

    res = query.execute()
    tracks_data = []
    
    for row in (res.data or []):
        tracks_data.append(TrackResponse(
            track_id=row["track_id"],
            qdrant_point_id=row.get("qdrant_point_id"),
            title=row["title"],
            artist_id=row["artist_id"],
            genre_id=row["genre_id"],
            artist_name=row["artists"]["artist_name"] if row.get("artists") else "Unknown Artist",
            genre_name=row["genres"]["genre_name"] if row.get("genres") else "Unknown Genre"
        ))

    return tracks_data

@router.post("", response_model=TrackResponse)
async def create_track(
    track_in: TrackCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    artist_id = track_in.artist_id
    genre_id = track_in.genre_id

    # Handle artist resolution/creation if name provided
    if not artist_id and track_in.artist_name:
        artist_name = track_in.artist_name.strip()
        normalized = artist_name.lower()
        art_res = supabase.table("artists").select("artist_id").eq("normalized_name", normalized).execute()
        if art_res.data:
            artist_id = art_res.data[0]["artist_id"]
        else:
            ins_art = supabase.table("artists").insert({"artist_name": artist_name, "normalized_name": normalized}).execute()
            artist_id = ins_art.data[0]["artist_id"]

    # Handle genre resolution/creation if name provided
    if not genre_id and track_in.genre_name:
        genre_name = track_in.genre_name.strip()
        gnr_res = supabase.table("genres").select("genre_id").eq("genre_name", genre_name).execute()
        if gnr_res.data:
            genre_id = gnr_res.data[0]["genre_id"]
        else:
            ins_gnr = supabase.table("genres").insert({"genre_name": genre_name}).execute()
            genre_id = ins_gnr.data[0]["genre_id"]

    if not artist_id or not genre_id:
        raise HTTPException(status_code=400, detail="Both artist and genre must be provided or resolvable")

    track_payload = {
        "title": track_in.title.strip(),
        "qdrant_point_id": track_in.qdrant_point_id,
        "artist_id": artist_id,
        "genre_id": genre_id
    }

    res = supabase.table("tracks").insert(track_payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create track")

    row = res.data[0]
    
    # Fetch names
    art_info = supabase.table("artists").select("artist_name").eq("artist_id", artist_id).single().execute()
    gnr_info = supabase.table("genres").select("genre_name").eq("genre_id", genre_id).single().execute()

    return TrackResponse(
        track_id=row["track_id"],
        qdrant_point_id=row.get("qdrant_point_id"),
        title=row["title"],
        artist_id=row["artist_id"],
        genre_id=row["genre_id"],
        artist_name=art_info.data["artist_name"] if art_info.data else "Unknown Artist",
        genre_name=gnr_info.data["genre_name"] if gnr_info.data else "Unknown Genre"
    )
