from pydantic import BaseModel, Field
from typing import Optional

class TasteItemCreate(BaseModel):
    track_id: Optional[int] = None
    title: Optional[str] = None
    artist_name: Optional[str] = None
    genre_name: Optional[str] = None
    rating: int = Field(..., ge=1, le=10)
    playlist_id: Optional[str] = None

class TasteItemUpdate(BaseModel):
    rating: int = Field(..., ge=1, le=10)

class TasteItemResponse(BaseModel):
    taste_id: str
    user_id: str
    track_id: int
    title: str
    artist_name: str
    genre_name: str
    rating: int
    playlist_id: Optional[str] = None
    added_at: str
