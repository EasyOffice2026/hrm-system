from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.database import get_db
from app.models.settings import SmtpSettings
from app.models.branch import Branch
from app.models.user import User
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/email", tags=["email"])


@router.get("/smtp-settings")
def get_smtp_settings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Only owner/manager can view SMTP settings")
    settings = db.query(SmtpSettings).first()
    if not settings:
        return None
    return {
        "id": settings.id,
        "smtp_host": settings.smtp_host,
        "smtp_port": settings.smtp_port,
        "smtp_user": settings.smtp_user,
        "from_email": settings.from_email,
        "from_name": settings.from_name,
        "use_tls": settings.use_tls,
        "has_password": bool(settings.smtp_password),
    }


@router.post("/smtp-settings")
def save_smtp_settings(
    smtp_host: str = Form(...), smtp_port: int = Form(587),
    smtp_user: str = Form(...), smtp_password: str = Form(""),
    from_email: str = Form(...), from_name: str = Form("HRM System"),
    use_tls: bool = Form(True),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Only owner/manager can update SMTP settings")
    settings = db.query(SmtpSettings).first()
    if settings:
        settings.smtp_host = smtp_host
        settings.smtp_port = smtp_port
        settings.smtp_user = smtp_user
        if smtp_password:
            settings.smtp_password = smtp_password
        settings.from_email = from_email
        settings.from_name = from_name
        settings.use_tls = use_tls
    else:
        settings = SmtpSettings(
            smtp_host=smtp_host, smtp_port=smtp_port,
            smtp_user=smtp_user, smtp_password=smtp_password,
            from_email=from_email, from_name=from_name, use_tls=use_tls,
        )
        db.add(settings)
    db.commit()
    db.refresh(settings)
    return {"status": "saved"}


@router.post("/test")
def test_smtp(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ("owner", "manager", "accountant"):
        raise HTTPException(403, "Only owner/manager can test SMTP")
    settings = db.query(SmtpSettings).first()
    if not settings:
        raise HTTPException(400, "SMTP not configured")
    try:
        msg = MIMEText("This is a test email from HRM System.", "plain")
        msg["Subject"] = "HRM System - SMTP Test"
        msg["From"] = f"{settings.from_name} <{settings.from_email}>"
        msg["To"] = settings.from_email
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.use_tls:
                server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return {"status": "sent", "message": f"Test email sent to {settings.from_email}"}
    except Exception as e:
        raise HTTPException(400, f"SMTP error: {str(e)}")
