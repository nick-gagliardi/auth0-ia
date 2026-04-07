# Mintlify Per-User Analytics Setup

## ✅ What's Been Implemented

The Mintlify analytics integration has been upgraded to support **per-user credentials** with encrypted storage.

### Files Created/Modified:

1. **Database Schema** (`migration-mintlify.sql`)
   - Adds `mintlify_api_key_encrypted` column
   - Adds `mintlify_project_id_encrypted` column
   - Adds index for faster lookups

2. **Database Layer** (`apps/web/src/lib/db.ts`)
   - Updated `User` interface with Mintlify fields
   - Updated `UserWithDecryptedCreds` interface
   - Added `updateUserMintlifyCredentials()` function
   - Updated `getUserWithDecryptedCreds()` to decrypt Mintlify credentials

3. **API Endpoints**
   - **`/api/settings/mintlify`** - Save/delete user Mintlify credentials
   - **`/api/settings`** - Updated to include Mintlify status
   - **`/api/analytics/feedback`** - Updated to use user credentials first, env vars second
   - **`/api/analytics/stats`** - Updated to use user credentials first, env vars second

4. **UI Components**
   - **Settings Page** (`apps/web/app/settings/page.tsx`) - Added Mintlify configuration card
   - Added state management for Mintlify credentials
   - Added save/delete handlers with validation

5. **Navigation**
   - Analytics link already in sidebar under "Health & Audit"

---

## 🚀 Setup Instructions

### Step 1: Run Database Migration

You need to run the migration to add the new columns to your Vercel Postgres database:

**Option A: Using Vercel Dashboard**
1. Go to your Vercel project dashboard
2. Navigate to Storage → Your Postgres database
3. Go to the Query tab
4. Copy and paste the contents of `migration-mintlify.sql`
5. Click "Execute"

**Option B: Using Vercel CLI**
```bash
# Connect to your database
vercel env pull .env.local

# Run the migration SQL
psql $DATABASE_URL < migration-mintlify.sql
```

**Option C: Let the app auto-migrate** (if you have an init script)
The migration is safe to run multiple times (uses `IF NOT EXISTS`).

---

### Step 2: Configure Your Credentials

Once the migration is complete and the app is deployed:

1. **Navigate to Settings** (http://localhost:3000/settings or your deployed URL)

2. **Scroll to "Mintlify Analytics" section**

3. **Enter your credentials:**
   - **API Key**: `mint_Bgg6q4nasm8RZ1g4wxc2Jn` (or generate a new one)
   - **Project ID**: `689a6fa9ed79cfbe19624b79`

4. **Click "Save Credentials"**
   - The system will validate your credentials
   - If valid, they'll be encrypted and stored in the database

5. **Access Analytics**
   - Navigate to `/analytics`
   - The dashboard will now use YOUR credentials

---

## 🔒 Security

### How Credentials Are Stored

- **Encrypted at rest**: All credentials are encrypted using AES-256 before storage
- **Per-user isolation**: Each user has their own encrypted credentials
- **Never logged**: Credentials are never written to logs
- **Never exposed**: API responses never include actual keys

### Encryption Flow

```
User Input → Validation → AES-256 Encryption → Database Storage
Database → Decryption → Use in API calls → Discard from memory
```

### Master Encryption Key

Ensure your `ENCRYPTION_MASTER_KEY` environment variable is set in production:
```bash
# Generate a new key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 How It Works

### Priority Order for Credentials

When fetching analytics, the system checks in this order:

1. **User's personal credentials** (from database, decrypted)
   - If user has configured Mintlify credentials in Settings
   - Takes priority over everything else

2. **Environment variables** (fallback)
   - `MINTLIFY_API_KEY`
   - `MINTLIFY_PROJECT_ID`
   - Used if user hasn't configured personal credentials

3. **Error** (if neither exists)
   - Returns 503 with helpful error message
   - Directs user to Settings page

### User Experience

**For users with personal credentials:**
- They see their own analytics data
- No need to share API keys
- Can revoke/update anytime

**For users without personal credentials:**
- Falls back to environment variables
- Shared analytics access
- Can configure personal credentials anytime

---

## 🧪 Testing

### Local Testing

1. **Start the dev server:**
   ```bash
   cd ~/auth0-ia-tool
   pnpm dev
   ```

2. **Run the migration locally** (if using local Postgres):
   ```bash
   psql $DATABASE_URL < migration-mintlify.sql
   ```

3. **Test the flow:**
   - Go to http://localhost:3000/settings
   - Configure Mintlify credentials
   - Go to http://localhost:3000/analytics
   - Verify data loads

### Verify Migration Success

Check that columns were added:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name LIKE 'mintlify%';
```

Should return:
```
mintlify_api_key_encrypted     | text
mintlify_project_id_encrypted  | text
```

---

## 🔄 Deployment Checklist

- [ ] Run database migration in production
- [ ] Verify `ENCRYPTION_MASTER_KEY` is set in Vercel
- [ ] Deploy the updated code
- [ ] Test settings page loads
- [ ] Configure your personal Mintlify credentials
- [ ] Test analytics page with user credentials
- [ ] (Optional) Remove `MINTLIFY_API_KEY` and `MINTLIFY_PROJECT_ID` from env vars to force user credentials

---

## 🐛 Troubleshooting

### "Mintlify analytics not configured" error

**Cause**: Neither user credentials nor environment variables are set

**Solution**:
1. Go to Settings
2. Configure Mintlify credentials
3. Refresh analytics page

### "Invalid Mintlify credentials" error

**Cause**: API key or project ID is incorrect

**Solution**:
1. Go to [Mintlify Dashboard → Settings → API Keys](https://dashboard.mintlify.com)
2. Generate a new API key
3. Find your project ID in settings
4. Update in Settings page

### Database migration fails

**Cause**: Columns already exist or syntax error

**Solution**:
- The migration uses `IF NOT EXISTS` so it's safe to re-run
- If columns exist, migration will skip them
- Check your database logs for specific errors

### Analytics page is slow

**Cause**: Fetching all feedback can be slow with lots of data

**Solution**:
- Use date filters to reduce data range
- Consider implementing pagination
- Cache results client-side

---

## 📝 Environment Variables

### Required (choose one)

**Option 1: Shared credentials (environment variables)**
```bash
MINTLIFY_API_KEY=mint_...
MINTLIFY_PROJECT_ID=689a6fa9ed79cfbe19624b79
```

**Option 2: Per-user credentials (database)**
- No environment variables needed
- Users configure in Settings

**Option 3: Hybrid (recommended)**
- Set environment variables as fallback
- Users can override with personal credentials

### Always Required

```bash
# Encryption (for storing user credentials)
ENCRYPTION_MASTER_KEY=your_64_character_hex_string

# Database
DATABASE_URL=postgresql://...

# NextAuth
NEXTAUTH_SECRET=your_secret
NEXTAUTH_URL=https://your-domain.com
```

---

## 🎯 Next Steps

### Immediate
1. ✅ Run database migration
2. ✅ Deploy to production
3. ✅ Configure your personal credentials
4. ✅ Test analytics dashboard

### Future Enhancements (Optional)
- [ ] Add page views analytics endpoint
- [ ] Add search queries analytics endpoint
- [ ] Add AI assistant conversations analytics
- [ ] Combine analytics with Auth0-IA graph data
- [ ] Create alerts for pages with many negative feedback items
- [ ] Export analytics to CSV/JSON

---

## 📚 Reference

### API Endpoints

**Settings:**
- `GET /api/settings` - Get user settings (includes Mintlify status)
- `POST /api/settings/mintlify` - Save Mintlify credentials
- `DELETE /api/settings/mintlify` - Delete Mintlify credentials

**Analytics:**
- `GET /api/analytics/feedback` - Get feedback data
- `GET /api/analytics/stats` - Get aggregated statistics

### Database Functions

```typescript
// Update user's Mintlify credentials
await updateUserMintlifyCredentials(userId, encryptedApiKey, encryptedProjectId);

// Get user with decrypted credentials
const user = await getUserWithDecryptedCreds(userId, true);
console.log(user.mintlify_api_key_decrypted);
```

---

## ✨ Summary

You now have a complete per-user Mintlify analytics integration with:
- ✅ Encrypted credential storage
- ✅ User settings UI
- ✅ Fallback to environment variables
- ✅ Secure API endpoints
- ✅ Full analytics dashboard

**The migration is the only thing left to run!**
