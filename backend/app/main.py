from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine ,Base,get_db
from app.schemas import UserCreate,UserResponse ,UserLogin
from app.models.user import User
from app.utils import hash_password ,verify_password,create_access_token


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
    hashed_pass=hash_password(user_data.password)
    new_user=User(
        name=user_data.name,
        email=user_data.email,
        hashed_password=hashed_pass
    )
    db.add(new_user)
    db.commit()

    db.refresh(new_user)

    return new_user

@app.post("/api/auth/login",status_code=status.HTTP_200_OK)
def login(user_data:UserLogin,db:Session=Depends(get_db)):
    # hash_pw=hash_password()
    user=db.query(User).filter(User.email==user_data.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Crediantials!!"
        )
    
    if not verify_password(user_data.password,user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Crediantials!!"
        )
    token_data={"user_id":user.id,"email":user.email}
    access_token=create_access_token(data=token_data)
    return {
        "token":access_token,
        "token_type":"bearer",
        "user":{
            "id": user.id,
            "name": user.name,
            "email": user.email
        }
    }