from pydantic import BaseModel, Field
from typing import Optional

class ArtistCreate(BaseModel):
    artist_name: str

class ArtistResponse(BaseModel):
    artist_id: int
    artist_name: str
    normalized_name: str

class GenreCreate(BaseModel):
    genre_name: str

class GenreResponse(BaseModel):
    genre_id: int
    genre_name: str

class TrackCreate(BaseModel):
    title: str
    qdrant_point_id: Optional[str] = None
    artist_name: Optional[str] = None
    artist_id: Optional[int] = None
    genre_name: Optional[str] = None
    genre_id: Optional[int] = None

class TrackResponse(BaseModel):
    track_id: int
    qdrant_point_id: Optional[str] = None
    title: str
    artist_id: int
    genre_id: int
    artist_name: Optional[str] = None
    genre_name: Optional[str] = None
