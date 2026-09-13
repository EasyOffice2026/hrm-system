from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, Text
from datetime import datetime, timezone
from app.database import Base
import json


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="staff")  # owner, admin, staff
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    allowed_tabs = Column(Text, nullable=True)  # JSON array of allowed tab keys, null = all
    allowed_brands = Column(Text, nullable=True)  # JSON array of brand ids, null = all/derive from branch

    def get_allowed_tabs(self) -> list[str] | None:
        if self.allowed_tabs is None:
            return None
        return json.loads(self.allowed_tabs)

    def set_allowed_tabs(self, tabs: list[str] | None):
        self.allowed_tabs = json.dumps(tabs) if tabs is not None else None

    def get_allowed_brands(self) -> list[int] | None:
        if self.allowed_brands is None:
            return None
        return json.loads(self.allowed_brands)

    def set_allowed_brands(self, brands: list[int] | None):
        self.allowed_brands = json.dumps(brands) if brands is not None else None
