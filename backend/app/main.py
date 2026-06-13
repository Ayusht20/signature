from fastapi import FastAPI
from app.config import settings
from app.database import engine ,Base

from app.models.user import User

Base.metadata.create_all(bind=engine)

app =FastAPI(title=settings.PROJECT_NAME)

@app.get("/")
def read_root():
    return {"message": f"Welcome to the restarted {settings.PROJECT_NAME}!"}
