# Medical Laboratory Management System - Design Guidelines

## Design Approach: Professional Medical Interface

**Selected Approach**: Design System (Material Design principles with medical sector adaptations)
**Rationale**: Medical applications require clarity, trust, and efficiency. Material Design provides proven patterns for data-heavy interfaces while maintaining accessibility and professional appearance.

**Key Design Principles**:
- Clinical professionalism with approachable warmth
- Clear information hierarchy for critical medical data
- Intuitive navigation for non-technical staff
- Print-optimized layouts for patient reports

---

## Core Design Elements

### A. Color Palette

**Light Mode (Primary)**:
- Primary: 200 85% 45% (Medical blue - trust and professionalism)
- Primary Hover: 200 85% 38%
- Secondary: 160 60% 45% (Healthcare green - health and vitality)
- Background: 0 0% 98%
- Surface: 0 0% 100%
- Text Primary: 220 20% 15%
- Text Secondary: 220 15% 45%
- Border: 220 15% 88%
- Success: 140 70% 45% (for approved results)
- Warning: 35 90% 55% (for pending items)
- Error: 0 75% 50% (for urgent alerts)

**Dark Mode (Optional for staff)**: 
- Background: 220 20% 10%
- Surface: 220 18% 14%
- Text Primary: 0 0% 95%
- Border: 220 15% 25%

### B. Typography

**Fonts**: 
- Primary: "Inter" (via Google Fonts CDN) - excellent readability for medical data
- Fallback: system-ui, -apple-system, sans-serif

**Scale**:
- Headings: text-3xl font-semibold (Dashboard titles)
- Section Headers: text-xl font-medium
- Data Labels: text-sm font-medium text-gray-600
- Body Text: text-base (Patient information, results)
- Data Values: text-lg font-semibold (Test results, prices)
- Small Print: text-xs (Timestamps, metadata)

### C. Layout System

**Spacing Units**: Tailwind 4, 6, 8, 12, 16 units
- Component padding: p-6
- Section spacing: space-y-6
- Card spacing: gap-4
- Form fields: space-y-4
- Page margins: p-8

**Container Strategy**:
- Dashboard: Full-width with max-w-7xl mx-auto
- Forms: max-w-4xl mx-auto
- Data Tables: Full-width with horizontal scroll on mobile
- Reports: max-w-5xl (print-optimized)

---

## D. Component Library

### Navigation & Layout
- **Sidebar Navigation**: Fixed left sidebar (w-64) with logo, main menu items, and quick stats
- **Top Bar**: Patient search, notifications, user profile, date/time display
- **Dashboard Cards**: Elevated cards (shadow-md) with rounded-xl borders
- **Breadcrumbs**: Show current location in system hierarchy

### Forms & Input
- **Input Fields**: Bordered style with focus ring, h-12 for comfortable touch
- **Labels**: Always above inputs, font-medium text-sm
- **Dropdowns**: Custom styled with chevron icons, max-height with scroll
- **Date Pickers**: Calendar popup with Uzbek date formatting
- **Number Inputs**: Large, clear for pricing and quantities
- **Radio/Checkbox**: Accent colored with clear labels

### Data Display
- **Patient Cards**: Avatar + name + ID + phone in horizontal layout
- **Test Results Table**: Striped rows, sticky headers, sortable columns
- **Financial Summary**: Large numbers with currency symbols, trend indicators
- **Statistics Cards**: Icon + number + label in 3-4 column grid
- **Status Badges**: Rounded-full with semantic colors (pending, completed, urgent)

### Actions & Controls
- **Primary Buttons**: bg-primary text-white, h-11 px-6 rounded-lg
- **Secondary Buttons**: border-2 border-primary text-primary
- **Icon Buttons**: rounded-full p-2 for quick actions
- **Action Menu**: Dropdown with edit/delete/print options
- **Print Button**: Always visible for reports and results

### Reports & Results
- **Test Result Card**: Clean white card with lab logo, patient info header, test table, footer with doctor signature area
- **Revenue Report**: Date range selector + summary cards + detailed table + export button
- **Patient History**: Timeline view with expandable test results

---

## E. Page-Specific Layouts

### Dashboard (Home)
- **Layout**: 4-column grid of metric cards (today's patients, pending tests, revenue, completed tests)
- **Recent Activity**: List of last 10 patient registrations with quick actions
- **Quick Access**: Large buttons for common tasks (New Patient, New Test Order, View Results)

### Patient Registration
- **Layout**: Two-column form (personal info left, contact details right)
- **Components**: Name, phone (with validation), address, age/gender, registration date/time
- **Action**: Large "Ro'yxatdan o'tkazish" (Register) button at bottom

### Test Order
- **Layout**: Patient selector at top, test checklist with prices, total calculator at bottom
- **Test Grid**: 3-column cards showing test name, price, checkbox selection
- **Summary Panel**: Fixed right panel showing selected tests and running total

### Results Entry
- **Layout**: Patient info header, test selector, results input form, save/print actions
- **Input Style**: Large text fields for numeric values, dropdowns for categorical results
- **Reference Ranges**: Display normal ranges next to each input

### Daily/Monthly Reports
- **Filters**: Date range picker, test type filter, payment status
- **Summary Cards**: Total revenue, patient count, average per patient
- **Detailed Table**: Sortable columns with export to PDF/Excel buttons

---

## F. Uzbek Language Considerations
- Right-to-left friendly layouts (though Uzbek Latin is LTR)
- All buttons, labels in Uzbek: "Saqlash", "Bekor qilish", "Chop etish"
- Date format: DD.MM.YYYY
- Currency: "so'm" suffix for all prices
- Clear typography for Uzbek characters (ʻ, oʻ, gʻ)

---

## G. Print Styling
- **Test Results**: Clean white background, hospital letterhead, patient details, results table, signature lines
- **Reports**: Landscape for wide tables, company logo, date range, summary, detailed breakdown
- **@media print**: Hide navigation, buttons; show only essential content

---

## Icons
**Library**: Heroicons (outline for navigation, solid for actions)
**Usage**: User-circle, clipboard-list, calculator, printer, calendar, chart-bar, document-text

---

## Accessibility & UX
- High contrast text (WCAG AA minimum)
- Large touch targets (min 44x44px)
- Clear focus indicators (ring-2 ring-primary)
- Loading states for all async operations
- Success/error messages with icons
- Confirmation dialogs for destructive actions