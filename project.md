# Expense Tracker PWA

## Overview
A minimal Progressive Web App for personal expense tracking. Built with vanilla HTML, CSS, and JavaScript — no frameworks, no CDN, no build tools. Runs by opening `index.html` directly. Works offline after first load and is installable on iPhone via Add to Home Screen.

## Features
- **Expenses**: Add, edit, delete expenses with title, amount, category, date, and up to 5 images
- **Categories**: food, transport, shopping, entertainment, other (enum)
- **Month filtering**: Select month (YYYY-MM), all data scoped to selected month
- **Budgets**: Set budget per month + category; view spent/remaining with progress bars
- **Summary**: Total spent, total budget, remaining displayed in header
- **Images**: Resized to max 800px width, converted to WebP, stored as Blobs in IndexedDB
- **Export/Import**: Full JSON backup with images encoded as Base64; import replaces all data

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

## Offline Mechanism
- **Service Worker** (`sw.js`) caches all app assets on install: `index.html`, `style.css`, `app.js`, `manifest.json`
- **Cache-first strategy**: serves from cache, falls back to network
- All data stored in IndexedDB (client-side), no server dependency
- After first load, the app works fully offline

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
- Charts and analytics
- Multi-currency with conversion
- Search and advanced filtering
- Expense tags/labels
- Split expenses
- Dark mode
- Data encryption
