# Loading Components Guide

This project includes beautiful water-themed loading animations that can be used throughout the application.

## 🌊 Available Loading Components

### 1. **LoadingScreen** (Full Page Loading)
Located at: `components/LoadingScreen.tsx`

**Usage:**
- Automatically shown when navigating between pages (via `loading.tsx` files)
- Full-screen water animation with timer
- Shows progress from 0% to 100%

**Features:**
- ✅ Animated water fill effect
- ✅ Rising bubbles
- ✅ Water surface ripples
- ✅ Timer display (MM:SS format)
- ✅ Progress percentage
- ✅ Animated background waves

---

### 2. **InlineLoading** (Component-Level Loading)
Located at: `components/InlineLoading.tsx`

**Usage:**
```tsx
import InlineLoading from "@/components/InlineLoading";

// Small size, no timer
<InlineLoading size="sm" />

// Medium size with timer
<InlineLoading size="md" showTimer={true} />

// Large size, full screen
<InlineLoading size="lg" showTimer={true} fullScreen={true} />
```

**Props:**
- `size`: `"sm" | "md" | "lg"` (default: `"md"`)
  - `sm`: 32x40 container
  - `md`: 48x60 container
  - `lg`: 64x80 container
- `showTimer`: `boolean` (default: `false`) - Shows elapsed time
- `fullScreen`: `boolean` (default: `false`) - Full screen mode with background waves

**Example Use Cases:**
```tsx
// Loading data in a component
function MyComponent() {
  const [loading, setLoading] = useState(true);
  
  if (loading) {
    return <InlineLoading size="md" showTimer={true} />;
  }
  
  return <div>Your content here</div>;
}

// Loading in a card
function DataCard() {
  const { data, isLoading } = useQuery(...);
  
  if (isLoading) {
    return (
      <div className="card">
        <InlineLoading size="sm" />
      </div>
    );
  }
  
  return <div>{data}</div>;
}
```

---

## 📁 Page-Level Loading Files

Loading states are automatically configured for all major routes:

- ✅ `/` - Root loading
- ✅ `/dashboard` - Dashboard loading
- ✅ `/crypto` - Crypto pages loading
- ✅ `/stocks` - Stock pages loading
- ✅ `/analytics` - Analytics loading
- ✅ `/portfolio` - Portfolio loading
- ✅ `/watchlist` - Watchlist loading
- ✅ `/news` - News loading
- ✅ `/profile` - Profile loading

These are automatically triggered by Next.js when:
- Navigating to a new page
- Loading Server Components
- Fetching data in Server Components

---

## 🎨 Customization

### Colors
The water animation uses a blue/cyan gradient:
- Primary: `from-blue-500 via-cyan-400 to-blue-300`
- Background: `from-slate-950 via-blue-950 to-slate-950`

To customize colors, edit the gradient classes in the component files.

### Animation Speed
- Water fill: 30ms per 1% (3 seconds total)
- Bubbles: 4-6 seconds per cycle
- Waves: 8 seconds per cycle
- Ripples: 3 seconds per cycle

Adjust the `setInterval` timing or animation durations in the component files.

---

## 💡 Tips

1. **For page navigation**: No code needed! Just navigate between pages.
2. **For async components**: Use `<InlineLoading />` with appropriate size.
3. **For full-page loading**: Use `<LoadingScreen />` or `<InlineLoading fullScreen={true} />`.
4. **For debugging**: Enable `showTimer={true}` to see how long loading takes.

---

## 🚀 Performance

- Animations use CSS transforms (GPU-accelerated)
- Minimal re-renders with React state
- Automatic cleanup on unmount
- Optimized for 60fps animations
