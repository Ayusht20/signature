from sqlalchemy import Integer, String, DateTime, ForeignKey, Column, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Documents(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, index=True, primary_key=True)
    title = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

    # 🔗 Link to parent User
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    owner = relationship("User", back_populates="documents")
    
    # 🔗 Link down to all child signature placements mapped on this file
    signatures = relationship("Signature", back_populates="document", cascade="all, delete-orphan")


class Signature(Base):
    __tablename__ = "signatures"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(Integer, ForeignKey("documents.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    x_coord = Column(Float, nullable=False)
    y_coord = Column(Float, nullable=False)
    page_num = Column(Integer, default=1)
    signature_data = Column(String, nullable=True)
    status = Column(String, default="pending")
    
    # 🚀 THE CRITICAL ADDITION: Add the string column field to handle the incoming Audit IP payload string
    ip_address = Column(String, default="127.0.0.1", nullable=True)
    # Relationships to navigate back to parent data configurations
    document = relationship("Documents", back_populates="signatures")
    user = relationship("User")