from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
from app.auth import get_current_user
from app.database import get_user_supabase
from supabase import Client
from app.schemas.user import UserProfileUpdate, UserTopArtistCreate, UserTopGenreCreate

router = APIRouter(prefix="/api/users", tags=["Users Profile"])

@router.get("/me")
async def get_my_profile(
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    
    # Fetch profile details from Supabase 'users' table
    response = supabase.table("users").select("*").eq("user_id", user_id).execute()
    
    if not response.data:
        # Create default initial profile if first login
        default_profile = {
            "user_id": user_id,
            "name": current_user.get("user_metadata", {}).get("name") or current_user["email"].split("@")[0],
            "email": current_user["email"],
            "country": "United Kingdom",
            "lastfm_username": "",
            "is_lastfm_synced": False
        }
        res_insert = supabase.table("users").insert(default_profile).execute()
        profile_data = res_insert.data[0] if res_insert.data else default_profile
    else:
        profile_data = response.data[0]

    # Fetch top artists preferences
    artists_res = supabase.table("user_top_artists").select("artists(artist_name)").eq("user_id", user_id).execute()
    top_artists = [item["artists"]["artist_name"] for item in (artists_res.data or []) if item.get("artists")]

    # Fetch top genres preferences
    genres_res = supabase.table("user_top_genres").select("genres(genre_name)").eq("user_id", user_id).execute()
    top_genres = [item["genres"]["genre_name"] for item in (genres_res.data or []) if item.get("genres")]

    return {
        **profile_data,
        "top_artists": top_artists,
        "top_genres": top_genres
    }

@router.put("/me")
async def update_my_profile(
    profile_update: UserProfileUpdate, 
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    update_data = {k: v for k, v in profile_update.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    res = supabase.table("users").update(update_data).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User profile not found")
    
    return res.data[0]

@router.post("/me/top-artists")
async def add_top_artist(
    payload: UserTopArtistCreate, 
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    artist_name = payload.artist_name.strip()
    normalized = artist_name.lower()

    # Find or insert artist in 'artists' table
    artist_res = supabase.table("artists").select("artist_id").eq("normalized_name", normalized).execute()
    if artist_res.data:
        artist_id = artist_res.data[0]["artist_id"]
    else:
        ins_art = supabase.table("artists").insert({"artist_name": artist_name, "normalized_name": normalized}).execute()
        artist_id = ins_art.data[0]["artist_id"]

    # Link to user top artists
    res = supabase.table("user_top_artists").upsert({"user_id": user_id, "artist_id": artist_id}).execute()
    return {"message": "Top artist added", "artist_name": artist_name, "artist_id": artist_id}

@router.post("/me/top-genres")
async def add_top_genre(
    payload: UserTopGenreCreate, 
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    genre_name = payload.genre_name.strip()

    # Find or insert genre in 'genres' table
    genre_res = supabase.table("genres").select("genre_id").eq("genre_name", genre_name).execute()
    if genre_res.data:
        genre_id = genre_res.data[0]["genre_id"]
    else:
        ins_gnr = supabase.table("genres").insert({"genre_name": genre_name}).execute()
        genre_id = ins_gnr.data[0]["genre_id"]

    # Link to user top genres
    res = supabase.table("user_top_genres").upsert({"user_id": user_id, "genre_id": genre_id}).execute()
    return {"message": "Top genre added", "genre_name": genre_name, "genre_id": genre_id}
