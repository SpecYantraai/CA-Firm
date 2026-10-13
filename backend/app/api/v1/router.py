from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, engagements, folders, wps, search, settings

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(engagements.router)
api_router.include_router(folders.router)
api_router.include_router(wps.router)
api_router.include_router(search.router)
api_router.include_router(settings.router)
