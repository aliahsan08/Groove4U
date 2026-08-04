from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List

class UserProfileBase(BaseModel):
    name: str
    email: EmailStr
    country: Optional[str] = None
    lastfm_username: Optional[str] = None
    is_lastfm_synced: Optional[bool] = False
    age: Optional[int] = Field(None, ge=13, le=120)
    gender: Optional[str] = None

class UserProfileCreate(UserProfileBase):
    pass

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None
    lastfm_username: Optional[str] = None
    is_lastfm_synced: Optional[bool] = None
    age: Optional[int] = Field(None, ge=13, le=120)
    gender: Optional[str] = None

class UserProfileResponse(UserProfileBase):
    user_id: str
    top_artists: List[str] = []
    top_genres: List[str] = []

class UserTopArtistCreate(BaseModel):
    artist_name: str

class UserTopGenreCreate(BaseModel):
    genre_name: str
