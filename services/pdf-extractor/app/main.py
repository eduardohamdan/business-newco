from fastapi import FastAPI, File, HTTPException, UploadFile

from .extract import extract

app = FastAPI(title="pdf-extractor", version="0.1.0")
MAX_BYTES = 15 * 1024 * 1024


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/extract")
async def extract_endpoint(file: UploadFile = File(...)) -> dict:
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Arquivo maior que 15 MB.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(415, "O arquivo não é um PDF.")
    try:
        return extract(data)
    except Exception as exc:  # noqa: BLE001 - devolve erro legível ao app
        raise HTTPException(422, f"Não foi possível ler o PDF: {type(exc).__name__}") from exc
