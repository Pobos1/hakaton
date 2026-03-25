# Book RAG Service

Сервис для загрузки `.txt` книг, поиска по ним и ответов на вопросы с RAG-контекстом.

## Стек и краткое описание

- **Frontend**: Next.js 14, React 18, TailwindCSS
- **Backend**: FastAPI, Uvicorn
- **RAG/поиск**: Sentence-Transformers (эмбеддинги), FAISS (векторный индекс)
- **LLM**: Groq API (чат-комплишены)

Флоу:
1) загружаете `.txt` → текст режется на чанки и индексируется локально в FAISS,
2) `search` возвращает релевантные фрагменты,
3) `ask` отправляет вопрос в Groq + добавляет найденные фрагменты как контекст.

## Как запустить сервис локально

### 1) Backend (FastAPI)

Перейдите в папку `backend` и поднимите виртуальное окружение:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Создайте файл `backend/.env` (пример есть в `backend/.env.example`) и укажите минимум:

- `GROQ_API_KEY=...`
- `GROQ_MODEL=llama-3.1-8b-instant`
- `CORS_ORIGINS=http://localhost:3000`
- `DATA_DIR=./data`

Запуск API:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

Проверка:

```bash
curl http://localhost:8000/health
```

### 2) Frontend (Next.js)

В другом терминале:

```bash
cd frontend
npm install
```

Создайте `frontend/.env.local` (пример есть в `frontend/.env.local.example`):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Запуск:

```bash
npm run dev
```

Откройте в браузере:
- `http://localhost:3000`

## Как загрузить тексты книг

Поддерживаются только `.txt` файлы.

### Вариант 1: через UI

1) Откройте `http://localhost:3000`
2) Перетащите/выберите один или несколько `.txt` файлов в блок “Загрузка книг (.txt)”
3) После индексации книги появятся в списке “Загруженные книги”

### Вариант 2: через API (curl)

```bash
curl -F "file=@/path/to/book.txt" http://localhost:8000/upload
```

Полезные эндпоинты:
- `GET /books` — список загруженных книг
- `DELETE /books/{book_title}` — удалить книгу из индекса
- `DELETE /books` — очистить все книги

# hakaton
