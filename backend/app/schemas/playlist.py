from pydantic import BaseModel
from typing import Optional, List
from app.schemas.track import TrackResponse

class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = None

class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class PlaylistTrackAdd(BaseModel):
    track_id: int
    position: Optional[int] = 0

class PlaylistResponse(BaseModel):
    playlist_id: str
    user_id: str
    name: str
    description: Optional[str] = None
    created_at: str
    tracks: List[TrackResponse] = []
