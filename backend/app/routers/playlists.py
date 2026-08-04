from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
from app.database import get_user_supabase
from supabase import Client
from app.auth import get_current_user
from app.schemas.playlist import PlaylistCreate, PlaylistUpdate, PlaylistTrackAdd, PlaylistResponse
from app.schemas.track import TrackResponse

router = APIRouter(prefix="/api/playlists", tags=["Playlists"])

@router.get("", response_model=List[PlaylistResponse])
async def list_user_playlists(
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    
    # Fetch playlists
    pl_res = supabase.table("playlists").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    playlists = pl_res.data or []
    
    result = []
    for pl in playlists:
        playlist_id = pl["playlist_id"]
        
        # Fetch tracks in playlist
        tracks_res = supabase.table("playlist_tracks").select(
            "position, tracks(track_id, qdrant_point_id, title, artist_id, genre_id, artists(artist_name), genres(genre_name))"
        ).eq("playlist_id", playlist_id).order("position").execute()

        playlist_tracks = []
        for item in (tracks_res.data or []):
            tr = item.get("tracks")
            if tr:
                playlist_tracks.append(TrackResponse(
                    track_id=tr["track_id"],
                    qdrant_point_id=tr.get("qdrant_point_id"),
                    title=tr["title"],
                    artist_id=tr["artist_id"],
                    genre_id=tr["genre_id"],
                    artist_name=tr["artists"]["artist_name"] if tr.get("artists") else "Unknown Artist",
                    genre_name=tr["genres"]["genre_name"] if tr.get("genres") else "Unknown Genre"
                ))

        result.append(PlaylistResponse(
            playlist_id=pl["playlist_id"],
            user_id=pl["user_id"],
            name=pl["name"],
            description=pl.get("description"),
            created_at=str(pl["created_at"]),
            tracks=playlist_tracks
        ))

    return result

@router.post("", response_model=PlaylistResponse)
async def create_playlist(
    playlist_in: PlaylistCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    payload = {
        "user_id": user_id,
        "name": playlist_in.name.strip(),
        "description": playlist_in.description
    }

    res = supabase.table("playlists").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create playlist")

    pl = res.data[0]
    return PlaylistResponse(
        playlist_id=pl["playlist_id"],
        user_id=pl["user_id"],
        name=pl["name"],
        description=pl.get("description"),
        created_at=str(pl["created_at"]),
        tracks=[]
    )

@router.put("/{playlist_id}", response_model=PlaylistResponse)
async def update_playlist(
    playlist_id: str,
    playlist_in: PlaylistUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    update_payload = {k: v for k, v in playlist_in.model_dump().items() if v is not None}
    
    res = supabase.table("playlists").update(update_payload).eq("playlist_id", playlist_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Playlist not found or access denied")

    pl = res.data[0]
    return PlaylistResponse(
        playlist_id=pl["playlist_id"],
        user_id=pl["user_id"],
        name=pl["name"],
        description=pl.get("description"),
        created_at=str(pl["created_at"]),
        tracks=[]
    )

@router.delete("/{playlist_id}")
async def delete_playlist(
    playlist_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    res = supabase.table("playlists").delete().eq("playlist_id", playlist_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Playlist not found or access denied")
    
    return {"message": "Playlist deleted successfully"}

@router.post("/{playlist_id}/tracks")
async def add_track_to_playlist(
    playlist_id: str,
    payload: PlaylistTrackAdd,
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    
    # Check playlist ownership
    pl_check = supabase.table("playlists").select("playlist_id").eq("playlist_id", playlist_id).eq("user_id", user_id).execute()
    if not pl_check.data:
        raise HTTPException(status_code=404, detail="Playlist not found or access denied")

    # Upsert playlist track
    res = supabase.table("playlist_tracks").upsert({
        "playlist_id": playlist_id,
        "track_id": payload.track_id,
        "position": payload.position or 0
    }).execute()

    return {"message": "Track added to playlist successfully"}

@router.delete("/{playlist_id}/tracks/{track_id}")
async def remove_track_from_playlist(
    playlist_id: str,
    track_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    
    # Check playlist ownership
    pl_check = supabase.table("playlists").select("playlist_id").eq("playlist_id", playlist_id).eq("user_id", user_id).execute()
    if not pl_check.data:
        raise HTTPException(status_code=404, detail="Playlist not found or access denied")

    res = supabase.table("playlist_tracks").delete().eq("playlist_id", playlist_id).eq("track_id", track_id).execute()
    return {"message": "Track removed from playlist successfully"}
