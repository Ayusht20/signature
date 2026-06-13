from sqlalchemy import Integer,String,Column ,DateTime
from datetime import datetime
from app.database import Base 

class User(Base):
    __tablename__="user"

    id=Column(Integer,primary_key=True,index=True)
    name=Column(String,nullable=False)
    email=Column(String,unique=True,index=True,nullable=False)
    hashed_paswword=Column(String,nullable=False)
    created_at=Column(DateTime,default=datetime.utcnow)


