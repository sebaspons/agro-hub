from pydantic import BaseModel, ConfigDict


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: RoleOut
    salesperson_id: int | None = None
