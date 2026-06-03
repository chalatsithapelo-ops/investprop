# Fund Usage Breakdown Feature

## Overview
This feature allows development managers and project managers to provide complete transparency about how raised funds will be allocated in fundraising campaigns. Investors can now see exactly where their money will be used before investing.

## What Was Added

### 1. Database Schema Changes
- Added `fundingBreakdown` JSON field to the `Property` model
- Stores an array of fund allocation items with:
  - `category`: String (e.g., "Renovations", "Water Rates", "Legal Fees")
  - `amount`: Number (dollar amount)
  - `description`: String (detailed explanation)

### 2. Backend Updates

#### Updated Procedure: `publishPropertyForFunding.ts`
- **New Input Validation**:
  - Now requires `fundingBreakdown` array with at least 1 item
  - Each item must have category, amount (positive), and description
  - **Critical Validation**: Total breakdown amounts must equal funding goal (within $0.01)

- **Schema Validation**:
  ```typescript
  fundingBreakdownItemSchema = z.object({
    category: z.string().min(1, "Category is required"),
    amount: z.number().positive("Amount must be positive"),
    description: z.string().min(1, "Description is required"),
  })
  ```

- **Error Handling**: Returns clear error if breakdown doesn't match funding goal

### 3. Frontend UI Updates

#### Updated Page: `/funding-campaigns`
Development managers publishing properties for funding now see:

**New Form Section: "Use of Funds Breakdown"**
- Add multiple breakdown items with "Add Item" button
- Each item has:
  - Category input (e.g., "Renovations")
  - Amount input (numeric)
  - Description textarea (detailed explanation)
- Remove items with trash icon (minimum 1 required)

**Real-Time Validation Display**:
- Shows total breakdown vs funding goal
- Color-coded status:
  - ✅ Green: Breakdown matches goal (within $0.01)
  - ⚠️ Orange: Breakdown doesn't match (shows difference)
- Displays "Remaining" or "Over by" amount
- Submit button disabled until breakdown matches goal

**Visual Features**:
- Clean card-based layout for each breakdown item
- Numbered items ("Item 1", "Item 2", etc.)
- Summary panel showing totals
- Responsive grid layout

#### Updated Page: `/properties/$propertyId`
Investors viewing funding campaigns now see:

**New Section: "Use of Funds"**
- Displayed above the investment form
- Shows each allocation category with:
  - **Category name** (large heading)
  - **Description** (detailed explanation)
  - **Amount** (large, prominent display)
  - **Percentage** (% of total funding goal)
  - **Progress bar** (visual representation of allocation size)

**Funding Summary Card**:
- Shows total funding goal
- Shows amount already raised
- Shows percentage funded
- Overall progress bar
- Gradient background for visual appeal

**Benefits for Investors**:
- Complete transparency before investing
- Understand exactly where money goes
- See proportional allocation visually
- Make informed investment decisions

### 4. Example Usage

#### Manager Publishing a Campaign:
```
Property: 123 Main St, Johannesburg
Funding Goal: $500,000
Closing Date: 2024-12-31

Use of Funds Breakdown:
1. Renovations - $250,000
   "Complete interior renovation including kitchen, bathrooms, and flooring"

2. Water Rates & Utilities - $10,000
   "Pay outstanding water rates and connect utilities"

3. Legal & Transfer Fees - $15,000
   "Legal fees, transfer costs, and bond registration"

4. Contingency Reserve - $25,000
   "Emergency fund for unexpected costs during renovation"

5. Marketing & Sales - $200,000
   "Professional staging, photography, and sales commission"

Total: $500,000 ✅
```

#### Investor Viewing the Campaign:
Sees a beautiful card-based layout showing:
- Each category with its amount and description
- Visual progress bars showing allocation percentages
- Summary showing $500,000 goal with $50,000 already raised (10% funded)
- Overall funding progress bar

## Technical Details

### Type Definition
```typescript
type FundingBreakdownItem = {
  category: string;
  amount: number;
  description: string;
};
```

### Validation Logic
```typescript
// Backend validation
const totalBreakdown = input.fundingBreakdown.reduce((sum, item) => sum + item.amount, 0);
if (Math.abs(totalBreakdown - input.fundingGoal) > 0.01) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Funding breakdown total must equal funding goal`,
  });
}

// Frontend validation
const totalBreakdown = fundingBreakdown?.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) || 0;
const breakdownComplete = fundingGoal && Math.abs(totalBreakdown - fundingGoal) < 0.01;
```

### Form Management
- Uses `react-hook-form` with `useFieldArray` for dynamic fields
- Watch functionality for real-time validation
- Controlled form state with default values

## Benefits

### For Development Managers:
- ✅ Build trust with investors
- ✅ Set clear expectations
- ✅ Professional presentation
- ✅ Reduce investor questions about fund usage

### For Investors:
- ✅ Complete transparency
- ✅ See detailed budget breakdown
- ✅ Make informed decisions
- ✅ Understand risk allocation
- ✅ Visual representation of fund usage

### For the Platform:
- ✅ Increased investor confidence
- ✅ Professional appearance
- ✅ Regulatory compliance (transparency)
- ✅ Reduced disputes over fund usage

## Testing Checklist

### As Development Manager:
1. ✅ Navigate to `/funding-campaigns`
2. ✅ Select a property with financial details
3. ✅ Enter funding goal (e.g., $500,000)
4. ✅ Add multiple breakdown items
5. ✅ Verify total validation (must equal goal)
6. ✅ Try submitting with mismatched total (should fail)
7. ✅ Try submitting with matching total (should succeed)
8. ✅ Verify property appears in "Active Campaigns"

### As Investor:
1. ✅ Navigate to `/investments` or browse properties
2. ✅ Click on a property with "RAISING_FUNDS" status
3. ✅ Scroll to "Use of Funds" section
4. ✅ Verify all breakdown items are displayed
5. ✅ Verify amounts and percentages are correct
6. ✅ Verify progress bars render correctly
7. ✅ Verify funding summary shows correct totals
8. ✅ Submit investment application

## Future Enhancements (Optional)

1. **Edit Breakdown After Publishing**:
   - Allow managers to update breakdown before funding closes
   - Notify existing investors of changes

2. **Actual vs Planned Tracking**:
   - Track actual spending against breakdown
   - Show variance reports to investors

3. **Category Templates**:
   - Predefined categories for common expenses
   - Quick selection for faster setup

4. **Multi-Currency Support**:
   - Support different currencies
   - Show amounts in investor's preferred currency

5. **Export Breakdown**:
   - PDF export of fund allocation
   - Excel export for investor records

## Migration Applied

Database schema updated with:
```sql
ALTER TABLE "Property" ADD COLUMN "fundingBreakdown" JSONB;
```

Migration method: `prisma db push` (due to existing database drift)
Status: ✅ Completed successfully
Generated Prisma Client: ✅ Updated

## Files Modified

### Backend:
- `prisma/schema.prisma` - Added fundingBreakdown field
- `src/server/trpc/procedures/publishPropertyForFunding.ts` - Added validation and storage

### Frontend:
- `src/routes/funding-campaigns/index.tsx` - Added breakdown form UI
- `src/routes/properties/$propertyId.tsx` - Added breakdown display for investors

### Documentation:
- `docs/FUND_BREAKDOWN_FEATURE.md` - This file

## Notes

- The fundingBreakdown field is optional (Json?) to support existing properties
- Validation ensures breakdown totals match funding goal within $0.01 (floating point tolerance)
- Form uses dynamic fields with `useFieldArray` for flexible number of items
- UI is fully responsive (mobile, tablet, desktop)
- Dark mode supported throughout
- Real-time validation provides immediate feedback
