from sqlalchemy import Column, Integer, String, Boolean
from app.database import Base


class SmtpSettings(Base):
    __tablename__ = "smtp_settings"

    id = Column(Integer, primary_key=True, index=True)
    smtp_host = Column(String, nullable=False, default="smtp.gmail.com")
    smtp_port = Column(Integer, nullable=False, default=587)
    smtp_user = Column(String, nullable=False)
    smtp_password = Column(String, nullable=False)
    from_email = Column(String, nullable=False)
    from_name = Column(String, default="HRM System")
    use_tls = Column(Boolean, default=True)
