from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
from app.database import get_user_supabase
from supabase import Client
from app.auth import get_current_user
from app.schemas.taste_profile import TasteItemCreate, TasteItemUpdate, TasteItemResponse

router = APIRouter(prefix="/api/taste-profile", tags=["Taste Profile"])

@router.get("", response_model=List[TasteItemResponse])
async def list_taste_items(
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    
    res = supabase.table("taste_profile").select(
        "taste_id, user_id, track_id, rating, playlist_id, added_at, tracks(title, artists(artist_name), genres(genre_name))"
    ).eq("user_id", user_id).order("added_at", desc=True).execute()

    taste_items = []
    for row in (res.data or []):
        tr = row.get("tracks") or {}
        taste_items.append(TasteItemResponse(
            taste_id=row["taste_id"],
            user_id=row["user_id"],
            track_id=row["track_id"],
            title=tr.get("title", "Unknown Track"),
            artist_name=tr.get("artists", {}).get("artist_name", "Unknown Artist") if tr.get("artists") else "Unknown Artist",
            genre_name=tr.get("genres", {}).get("genre_name", "Unknown Genre") if tr.get("genres") else "Unknown Genre",
            rating=row["rating"],
            playlist_id=row.get("playlist_id"),
            added_at=str(row["added_at"])
        ))

    return taste_items

@router.post("", response_model=TasteItemResponse)
async def add_taste_item(
    item_in: TasteItemCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    track_id = item_in.track_id

    # On-demand Track creation if user enters custom title & artist
    if not track_id and item_in.title and item_in.artist_name and item_in.genre_name:
        artist_name = item_in.artist_name.strip()
        genre_name = item_in.genre_name.strip()
        normalized_art = artist_name.lower()

        # Artist lookup / create
        art_res = supabase.table("artists").select("artist_id").eq("normalized_name", normalized_art).execute()
        if art_res.data:
            art_id = art_res.data[0]["artist_id"]
        else:
            ins_art = supabase.table("artists").insert({"artist_name": artist_name, "normalized_name": normalized_art}).execute()
            art_id = ins_art.data[0]["artist_id"]

        # Genre lookup / create
        gnr_res = supabase.table("genres").select("genre_id").eq("genre_name", genre_name).execute()
        if gnr_res.data:
            gnr_id = gnr_res.data[0]["genre_id"]
        else:
            ins_gnr = supabase.table("genres").insert({"genre_name": genre_name}).execute()
            gnr_id = ins_gnr.data[0]["genre_id"]

        # Track insert
        ins_tr = supabase.table("tracks").insert({
            "title": item_in.title.strip(),
            "artist_id": art_id,
            "genre_id": gnr_id
        }).execute()
        
        if ins_tr.data:
            track_id = ins_tr.data[0]["track_id"]

    if not track_id:
        raise HTTPException(status_code=400, detail="Valid track_id or complete track details (title, artist, genre) required")

    # Upsert taste profile rating
    taste_payload = {
        "user_id": user_id,
        "track_id": track_id,
        "rating": item_in.rating,
        "playlist_id": item_in.playlist_id
    }

    res = supabase.table("taste_profile").upsert(taste_payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to record taste profile rating")

    row = res.data[0]
    
    # Fetch hydrated names for response
    tr_info = supabase.table("tracks").select(
        "title, artists(artist_name), genres(genre_name)"
    ).eq("track_id", track_id).single().execute()
    
    tr_data = tr_info.data or {}

    return TasteItemResponse(
        taste_id=row["taste_id"],
        user_id=row["user_id"],
        track_id=row["track_id"],
        title=tr_data.get("title", "Unknown Track"),
        artist_name=tr_data.get("artists", {}).get("artist_name", "Unknown Artist") if tr_data.get("artists") else "Unknown Artist",
        genre_name=tr_data.get("genres", {}).get("genre_name", "Unknown Genre") if tr_data.get("genres") else "Unknown Genre",
        rating=row["rating"],
        playlist_id=row.get("playlist_id"),
        added_at=str(row["added_at"])
    )

@router.put("/{taste_id}", response_model=TasteItemResponse)
async def update_taste_rating(
    taste_id: str,
    item_in: TasteItemUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    
    res = supabase.table("taste_profile").update({"rating": item_in.rating}).eq("taste_id", taste_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Taste profile entry not found or access denied")

    row = res.data[0]
    track_id = row["track_id"]
    
    tr_info = supabase.table("tracks").select(
        "title, artists(artist_name), genres(genre_name)"
    ).eq("track_id", track_id).single().execute()
    
    tr_data = tr_info.data or {}

    return TasteItemResponse(
        taste_id=row["taste_id"],
        user_id=row["user_id"],
        track_id=row["track_id"],
        title=tr_data.get("title", "Unknown Track"),
        artist_name=tr_data.get("artists", {}).get("artist_name", "Unknown Artist") if tr_data.get("artists") else "Unknown Artist",
        genre_name=tr_data.get("genres", {}).get("genre_name", "Unknown Genre") if tr_data.get("genres") else "Unknown Genre",
        rating=row["rating"],
        playlist_id=row.get("playlist_id"),
        added_at=str(row["added_at"])
    )

@router.delete("/{taste_id}")
async def delete_taste_item(
    taste_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase)
):
    user_id = current_user["id"]
    res = supabase.table("taste_profile").delete().eq("taste_id", taste_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Taste profile entry not found or access denied")
    
    return {"message": "Taste profile item deleted successfully"}
