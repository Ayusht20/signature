from sqlalchemy import Integer,String,Column ,DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base 

class User(Base):
    __tablename__="users"

    id=Column(Integer,primary_key=True,index=True)
    name=Column(String,nullable=False)
    email=Column(String,unique=True,index=True,nullable=False)
    hashed_password=Column(String,nullable=False)
    created_at=Column(DateTime,default=datetime.utcnow)

    # Relationship: Links down to all documents owned by this user
    documents = relationship("Documents", back_populates="owner", cascade="all, delete-orphan")

