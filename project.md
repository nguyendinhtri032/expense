# Expense Tracker PWA

## Overview
A minimal Progressive Web App for personal expense tracking. Built with vanilla HTML, CSS, and JavaScript — no frameworks, no CDN, no build tools. Runs by opening `index.html` directly. Works offline after first load and is installable on iPhone via Add to Home Screen.

## Features
- **Expenses**: Add, edit, delete expenses with title, amount, category, date, and up to 5 images
- **Categories**: food, other (enum)
- **Month filtering**: Select month (YYYY-MM), all data scoped to selected month
- **Budgets**: Set budget per month + category; view spent/remaining with progress bars
- **Summary**: Total spent, total budget, remaining displayed in header
- **Images**: Resized to max 800px width, converted to WebP, stored as Blobs in IndexedDB
- **Export/Import**: Full JSON backup with images encoded as Base64; import replaces all data
- **Detail view**: Read-only detail view when tapping an expense; must tap "Edit" button to enter edit mode (prevents accidental edits)
- **Image viewer**: Tap any image thumbnail (in detail or edit view) to view full-size in a fullscreen overlay
- **Smart default category**: When creating a new expense, defaults to the first category; if its remaining budget <= 0, defaults to the second category
- **Chart tab**: Visual chart showing cumulative spending (pink area, dashed border) and remaining budget (blue line) per day of the month — drawn with Canvas API, no libraries

## Data Structure (IndexedDB)

**Database**: `expenseDB`

### expenses store
| Field    | Type       | Notes                        |
|----------|------------|------------------------------|
| id       | number     | keyPath, autoIncrement       |
| title    | string     |                              |
| amount   | number     |                              |
| category | string     | enum                         |
| date     | string     | ISO YYYY-MM-DD               |
| images   | Blob[]     | 0-5 WebP blobs               |

**Index**: `date`

### budgets store
| Field    | Type   | Notes                          |
|----------|--------|--------------------------------|
| id       | string | keyPath = `${month}_${category}` |
| month    | string | YYYY-MM                        |
| category | string | enum                           |
| amount   | number |                                |

**Indexes**: `month`, `category`

## Offline & Auto-Update Mechanism
- **Service Worker** (`sw.js`) caches all app assets on install: `index.html`, `style.css`, `app.js`, `manifest.json`
- **Network-first strategy**: tries network first, caches response dynamically, falls back to cache if offline
- **Versioned cache**: cache name includes `APP_VERSION` (e.g., `expense-v1.0.1`). Bump version in `sw.js` to trigger update on deploy
- **Auto-update flow**: `skipWaiting()` + `clients.claim()` → app detects `controllerchange` → shows toast "App đã cập nhật" → auto-reloads after 1.5s
- **Anti-reload-loop**: uses `sessionStorage` timestamp to prevent reload within 5 seconds
- **Periodic update check**: every 30 minutes via `registration.update()`
- All data stored in IndexedDB (client-side), no server dependency

## Export/Import Logic
- **Export**: Reads all expenses and budgets from IndexedDB. Image Blobs are converted to Base64 data URLs. Output is a single JSON file downloaded to the device.
- **Import**: Parses uploaded JSON file. Clears all existing data. Base64 strings are converted back to Blobs. All records are written to IndexedDB. The UI refreshes immediately.

## Timezone
- All dates use `Asia/Ho_Chi_Minh` timezone
- Display format: `dd/mm/yyyy`

## Budget Logic
- Expenses are independent of budgets — users can always create expenses
- Budgets are informational: they track spending and show warnings
- When an expense would exceed the budget, a warning is shown but the expense is still allowed
- When a budget is created after expenses exist, spent/remaining are recalculated automatically
- Editing or deleting expenses triggers recalculation

## UI Structure
- **Tab bar**: Two tabs — "Chi tiêu" (main view) and "Biểu đồ" (chart view)
- **Expense modal**: Opens as detail (read-only) when tapping existing expense; "Edit" button switches to form mode. Opens as form directly when creating new expense.
- **Image viewer**: Fullscreen overlay (z-index 300) with close button; works for both detail and edit views
- **Chart**: Canvas-based, renders cumulative spending area + remaining budget line; auto-scales Y axis; responsive X labels based on container width

## Limitations
- No backend — data lives only on the device
- No sync between devices
- No recurring expenses
- No multi-currency support
- Image storage uses IndexedDB which has storage limits (~50MB-unlimited depending on browser)
- Export files can be large if many images are stored
- Service Worker requires HTTPS or localhost (file:// protocol has limited SW support in some browsers)

## Future Improvements
- Cloud sync (Firebase, Supabase)
- Recurring expenses
- Multi-currency with conversion
- Search and advanced filtering
- Expense tags/labels
- Split expenses
- Dark mode
- Data encryption
