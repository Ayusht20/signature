from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer ,OAuth2PasswordRequestForm
import jwt
import os
from fastapi import UploadFile, File
import fitz
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware
from pyuploadcare import Uploadcare
import requests

from app.config import settings
from app.database import engine ,Base,get_db
from app.schemas import UserCreate,UserResponse ,UserLogin
from app.models.user import User
from app.utils import hash_password ,verify_password,create_access_token
from app.models.document import Documents, Signature


Base.metadata.create_all(bind=engine)

app =FastAPI(title=settings.PROJECT_NAME)

UPLOADCARE_PUBLIC_KEY=settings.UPLOADCARE_PUBLIC_KEY
UPLOADCARE_SECRET_KEY=settings.UPLOADCARE_SECRET_KEY
uploadcare_client = Uploadcare(public_key=UPLOADCARE_PUBLIC_KEY, secret_key=UPLOADCARE_SECRET_KEY)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],
)

oauth2_scheme=OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(token:str=Depends(oauth2_scheme),db:Session=Depends(get_db)):
    credntials_exception=HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload=jwt.decode(token,settings.SECRET_KEY,algorithms=[settings.ALGORITHM])
        email:str=payload.get("email")
        if email is None:
            raise credntials_exception
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired!")
    
    except jwt.PyJWTError:
        raise credntials_exception
    
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credntials_exception
    
    return user

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
def login(user_data:OAuth2PasswordRequestForm=Depends(),db:Session=Depends(get_db)):
    # hash_pw=hash_password()
    user=db.query(User).filter(User.email==user_data.username).first()
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
        "access_token":access_token,
        "token_type":"bearer",
        "user":{
            "id": user.id,
            "name": user.name,
            "email": user.email
        }
    }

@app.get("/api/auth/me",response_model=UserResponse)
def get_dashboard(current_user:User=Depends(get_current_user)):
    return current_user




UPLOADCARE_CDN_BASE = "https://17afggysii.ucarecd.net"


# ============================================================
# STEP 2 — Replace your /api/docs/upload function with this.
# Builds the URL from UPLOADCARE_CDN_BASE instead of
# ucarecdn.com or relying on cloud_file.cdn_url.
# ============================================================

import time

@app.post("/api/docs/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed!")

    try:
        contents = await file.read()
        temp_dir = "/tmp" if os.path.exists("/tmp") else "."
        temp_file_name = f"upload_{datetime.utcnow().timestamp()}_{file.filename}"
        temp_local_path = os.path.join(temp_dir, temp_file_name)

        with open(temp_local_path, "wb") as f:
            f.write(contents)

        with open(temp_local_path, "rb") as file_object:
            cloud_file = uploadcare_client.upload(file_object)

        cloud_file.store()

        is_stored = False
        for attempt in range(6):
            cloud_file.update_info()
            is_stored = cloud_file.is_stored
            if is_stored:
                break
            time.sleep(0.5 * (attempt + 1))

        if not is_stored:
            raise HTTPException(
                status_code=502,
                detail="Uploadcare did not confirm storage in time. Please retry the upload."
            )

        # ✅ Build URL from YOUR confirmed working subdomain — no ambiguity.
        stable_cdn_url = f"{UPLOADCARE_CDN_BASE}/{cloud_file.uuid}/"
        # print(f"[UPLOAD] doc stored at: {stable_cdn_url}")

        if os.path.exists(temp_local_path):
            os.remove(temp_local_path)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file ingestion pipeline: {str(e)}")
    finally:
        await file.close()

    new_doc = Documents(
        title=file.filename,
        file_path=stable_cdn_url,
        owner_id=current_user.id
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    return {
        "message": "Document uploaded and confirmed stored in cloud!",
        "document_id": new_doc.id,
        "title": new_doc.title,
        "status": new_doc.status,
        "owner_id": new_doc.owner_id
    }

@app.get("/api/docs")
def list_my_documents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Returns only the documents belonging to the authenticated user profile session
    return db.query(Documents).filter(Documents.owner_id == current_user.id).all()

import base64
from pydantic import BaseModel

# Define schemas payload validation class interface mapping data packets
class SignaturePlotRequest(BaseModel):
    signature_data: str

@app.post("/api/signatures")
def place_signature_coordinates(
    doc_id: int, x: float, y: float, page: int = 1, ip_address: str = "127.0.0.1",
    payload: SignaturePlotRequest = None, 
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = db.query(Documents).filter(Documents.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document structure target missing.")
        
    sig_data_content = payload.signature_data if payload else None
        
    new_signature = Signature(
        doc_id=doc_id, 
        user_id=current_user.id, 
        x_coord=x, 
        y_coord=y, 
        page_num=page,
        signature_data=sig_data_content,
        ip_address=ip_address 
    )
    db.add(new_signature)
    db.commit()
    return {"message": "Signature properties and User IP audit logs saved successfully", "signature_id": new_signature.id}

@app.post("/api/signatures/finalize")
def finalize_and_sign_pdf(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(Documents).filter(Documents.id == doc_id, Documents.owner_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or access parameters denied.")

    sig = db.query(Signature).filter(Signature.doc_id == doc_id, Signature.status == "pending").order_by(Signature.id.desc()).first()
    if not sig:
        raise HTTPException(status_code=400, detail="No active pending coordinates tracking marker discovered.")

    try:
        # Pull the current file down using the SAME proxy logic as the download
        # endpoint, so it's resilient to whatever domain is actually saved.
        response = requests.get(
            doc.file_path,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            allow_redirects=True,
            timeout=15,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to pull source PDF (status {response.status_code}) from {doc.file_path}")

        temp_dir = "/tmp" if os.path.exists("/tmp") else "."
        local_sign_path = os.path.join(temp_dir, f"process_{doc.id}.pdf")

        with open(local_sign_path, "wb") as f:
            f.write(response.content)

        pdf_document = fitz.open(local_sign_path)
        page = pdf_document[sig.page_num - 1]

        page_width  = page.rect.width
        page_height = page.rect.height

        watermark_text = f"SIGNED | IP: {sig.ip_address or '127.0.0.1'} | ID: {sig.id}"
        page.insert_text(
            fitz.Point(page_width - 220, page_height - 20),
            watermark_text,
            fontsize=6,
            fontname="Helvetica",
            color=(0.65, 0.65, 0.65),
        )

        x = sig.x_coord
        y = sig.y_coord
        raw = str(sig.signature_data) if sig.signature_data else ""

        if raw.startswith("TEXT:"):
            content = raw[5:]
            name       = content
            font_name  = "Times-Italic"
            ink_color  = (0.10, 0.18, 0.43)

            if "|FONT:" in content:
                parts     = content.split("|FONT:", 1)
                name      = parts[0]
                remainder = parts[1]

                if "|COLOR:" in remainder:
                    font_part, color_part = remainder.split("|COLOR:", 1)
                    font_name = font_part.strip()
                    try:
                        r, g, b   = [float(v) for v in color_part.strip().split(",")]
                        ink_color = (r, g, b)
                    except ValueError:
                        pass
                else:
                    font_name = remainder.strip()

            safe_x = min(max(x, 10), page_width - 170)
            # Clamp adjusted_y so it never goes negative (which would push the
            # text box above the visible page, making the signature invisible
            # even though insert_textbox succeeds with no error).
            adjusted_y = max(y - 4, 5)
            adjusted_y = min(adjusted_y, page_height - 35)  # also keep clear of bottom edge
            name_rect = fitz.Rect(safe_x, adjusted_y, safe_x + 160, adjusted_y + 20)

            # print(f"[SIGN] page={sig.page_num} x={safe_x} y={adjusted_y} color={ink_color} font={font_name} name={name!r}")

            page.insert_textbox(
                name_rect, name, fontsize=13, fontname=font_name,
                color=ink_color, align=0,
            )

            meta_rect = fitz.Rect(safe_x, adjusted_y + 20, safe_x + 160, adjusted_y + 30)
            meta_text = f"Signed  ·  ID: SEC-{sig.id}  ·  {datetime.utcnow().strftime('%Y-%m-%d')}"
            page.insert_textbox(meta_rect, meta_text, fontsize=5, fontname="Helvetica", color=(0.5, 0.5, 0.5))

        elif "base64," in raw:
            rect = fitz.Rect(x, y - 10, x + 160, y + 40)
            _, b64 = raw.split("base64,", 1)
            page.insert_image(rect, stream=base64.b64decode(b64))

        else:
            name_rect = fitz.Rect(x, y, x + 200, y + 25)
            page.insert_textbox(name_rect, current_user.name, fontsize=14, fontname="Times-Italic", color=(0.10, 0.18, 0.43))

        sig.status = "signed"
        db.query(Signature).filter(
            Signature.doc_id == doc_id,
            Signature.status == "pending",
            Signature.id != sig.id
        ).update({"status": "cancelled"})

        buffer = pdf_document.write()
        pdf_document.close()

        with open(local_sign_path, "wb") as f:
            f.write(buffer)

        # ── Re-upload the signed PDF back to Uploadcare ──────────────────
        with open(local_sign_path, "rb") as final_file_object:
            updated_cloud_file = uploadcare_client.upload(final_file_object)

        updated_cloud_file.store()

        # ✅ FIX: wait for storage to be CONFIRMED before reading cdn_url.
        # Reading .cdn_url immediately after upload (before store completes)
        # can return a stale/default-domain URL that 404s. Same root cause
        # as the original upload endpoint bug — fixed here the same way,
        # PLUS we build the URL from our own known-good CDN base instead of
        # trusting the SDK property at all, for maximum reliability.
        is_stored = False
        for attempt in range(6):
            updated_cloud_file.update_info()
            is_stored = updated_cloud_file.is_stored
            if is_stored:
                break
            time.sleep(0.5 * (attempt + 1))

        if not is_stored:
            raise HTTPException(status_code=502, detail="Signed PDF failed to confirm storage on Uploadcare after signing.")

        new_cdn_url = f"{UPLOADCARE_CDN_BASE}/{updated_cloud_file.uuid}/"
        # print(f"[FINALIZE] doc {doc.id} re-uploaded, new URL: {new_cdn_url}")

        if os.path.exists(local_sign_path):
            os.remove(local_sign_path)

        doc.file_path = new_cdn_url
        doc.status = "signed"
        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"PDF cloud process engine exception error: {str(e)}")

    return {"message": "Document successfully signed and sealed!", "document_id": doc.id, "status": doc.status}

from fastapi.responses import RedirectResponse
from fastapi import Query

from fastapi.responses import StreamingResponse
import io

import urllib.request

@app.get("/api/docs/download/{doc_id}")
def download_or_view_document(doc_id: int, export: bool = Query(False), db: Session = Depends(get_db)):
    """
    Streams the PDF from Uploadcare's CDN through to the frontend.
    Uses `requests` (already a working dependency in this file) instead of
    raw urllib — requests handles redirects, retries, and SSL more reliably.
    """
    doc = db.query(Documents).filter(Documents.id == doc_id).first()
    if not doc or not doc.file_path:
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        # print(f"[DOWNLOAD] doc_id={doc_id} fetching: {doc.file_path}")

        resp = requests.get(
            doc.file_path,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            allow_redirects=True,
            timeout=15,
        )

        # print(f"[DOWNLOAD] doc_id={doc_id} upstream status: {resp.status_code} final_url: {resp.url}")

        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Upstream CDN returned {resp.status_code} for URL: {doc.file_path} (resolved to {resp.url})"
            )

        file_bytes = io.BytesIO(resp.content)

        if export:
            response_headers = {"Content-Disposition": f"attachment; filename={doc.title}"}
        else:
            response_headers = {"Content-Disposition": f"inline; filename={doc.title}"}

        return StreamingResponse(
            file_bytes,
            media_type="application/pdf",
            headers=response_headers,
        )

    except HTTPException:
        raise
    except Exception as e:
        # print(f"[DOWNLOAD] doc_id={doc_id} CRASH: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to stream document: {str(e)}")
        
# Add this Pydantic schema near your other schemas (or in app/schemas.py)
from pydantic import BaseModel
from typing import Optional
from datetime import datetime as dt

class SignatureLogResponse(BaseModel):
    id: int
    doc_id: int
    user_id: int
    x_coord: float
    y_coord: float
    page_num: int
    status: str
    ip_address: Optional[str] = None

    class Config:
        from_attributes = True  # pydantic v2 (use orm_mode=True if pydantic v1)


@app.get("/api/signatures/logs", response_model=list[SignatureLogResponse])
def fetch_all_signature_audit_logs(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """
    Returns finalized signature records belonging to the authenticated user profile,
    filtering out incomplete coordinate selections to keep audit paths clear.
    """
    # 🚀 THE FIX: Only fetch signed entries belonging to current_user
    records = db.query(Signature)\
        .filter(Signature.user_id == current_user.id)\
        .filter(Signature.status == "signed")\
        .order_by(Signature.id.desc())\
        .all()
        
    return records



@app.get("/api/debug/doc/{doc_id}")
def debug_doc(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Documents).filter(Documents.id == doc_id).first()
    if not doc:
        return {"error": "no db row for this id"}

    result = {
        "doc_id": doc.id,
        "title": doc.title,
        "saved_file_path": doc.file_path,
        "status": doc.status,
        "owner_id": doc.owner_id,
    }

    try:
        url_parts = [p for p in doc.file_path.split("/") if p]
        file_uuid = url_parts[-1] if url_parts else None
        result["extracted_uuid"] = file_uuid

        if file_uuid:
            uc_file = uploadcare_client.file(file_uuid)
            info_dict = uc_file.info
            result["uploadcare_info_raw"] = info_dict
            result["uploadcare_is_stored"] = info_dict.get("is_stored") if info_dict else None
            result["uploadcare_is_ready"] = info_dict.get("is_ready") if info_dict else None
    except Exception as e:
        result["uploadcare_lookup_error"] = str(e)



