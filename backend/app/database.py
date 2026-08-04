from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client, ClientOptions
from app.config import settings

# Global Supabase Client (Service Role / Admin Key) - Use only for backend tasks!
def get_supabase_admin_client() -> Client:
    # Use SECRET_KEY for admin/backend queries if available, fallback to PUBLIC_KEY
    key = settings.SUPABASE_SECRET_KEY if settings.SUPABASE_SECRET_KEY != "your_supabase_secret_key_here" else settings.SUPABASE_PUBLIC_KEY
    return create_client(settings.SUPABASE_URL, key)

supabase: Client = get_supabase_admin_client()

security = HTTPBearer(auto_error=False)

# Request-scoped Supabase Client (Public Key + User Token) - Use for all user actions!
def get_user_supabase(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Client:
    options = ClientOptions()
    if credentials and credentials.credentials:
        # Attach the user's JWT so Supabase knows exactly who is making the request (RLS applies)
        options.headers.update({"Authorization": f"Bearer {credentials.credentials}"})
    
    # Always use the PUBLIC_KEY for the user-facing client
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_PUBLIC_KEY, options=options)
