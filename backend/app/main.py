from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine ,Base,get_db
from app.schemas import UserCreate,UserResponse
from app.models.user import User

Base.metadata.create_all(bind=engine)

app =FastAPI(title=settings.PROJECT_NAME)

@app.get("/")
def read_root():
    return {"message": f"Welcome to the restarted {settings.PROJECT_NAME}!"}


@app.post("/api/auth/register",response_model=UserResponse,status_code=status.HTTP_201_CREATED)
def register(user_data:UserCreate,db:Session=Depends(get_db)):
    existing_user=db.query(User).filter(User.email==user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered!!"
        )
    new_user=User(
        name=user_data.name,
        email=user_data.email,
        hashed_password=user_data.password
    )
    db.add(new_user)
    db.commit()

    db.refresh(new_user)

    return new_user