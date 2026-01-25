# MetaClips Mobile Testing Checklist

## Overview
This document provides a comprehensive checklist for testing MetaClips on mobile devices to ensure optimal user experience across iOS and Android platforms.

## Test Devices
- **iOS**: iPhone (Safari, Chrome)
- **Android**: Various devices (Chrome, Firefox, Samsung Internet)
- **Screen Sizes**: Small (< 375px), Medium (375-768px), Large (> 768px)

---

## 1. Files Page Testing

### Layout & Navigation
- [ ] Files heading is appropriately sized (not too large)
- [ ] "Upload Files" and "Clean Up Storage" buttons are on the same line
- [ ] Buttons are appropriately sized for mobile
- [ ] Show Filters button does not overlap with grid/list toggle
- [ ] Navigation menu is sticky and visible when scrolling
- [ ] Menu button opens/closes smoothly

### File Grid
- [ ] Files display in 2-column grid on mobile
- [ ] File cards fit properly within viewport width
- [ ] Text does not overflow or run off the right edge
- [ ] Thumbnails load and display correctly
- [ ] Quality scores (40%, 75%, etc.) are visible and positioned correctly

### Selection Checkboxes
- [ ] Checkboxes are small enough (w-3.5 h-3.5 on mobile)
- [ ] Checkboxes are easy to tap with finger
- [ ] Checkbox state changes immediately on tap
- [ ] "Select All" checkbox works correctly
- [ ] Selected files are visually distinct

### Filters
- [ ] Filter controls display in 2-column grid on mobile
- [ ] All filter dropdowns are accessible and functional
- [ ] Filter selections apply correctly
- [ ] "Show Filters" button toggles filter visibility

### File Actions
- [ ] Close button (X) on file cards is positioned correctly
- [ ] Close button does not overlap with filename or description
- [ ] Tapping file card opens file detail modal
- [ ] Long-press on file card does not cause unwanted behavior

---

## 2. File Detail Modal Testing

### Layout
- [ ] Modal is wide enough (95vw) to avoid horizontal scrolling
- [ ] Close button (X) is sticky at top-right when scrolling
- [ ] Close button remains visible throughout scroll
- [ ] Content is readable without zooming
- [ ] Metadata fields are properly formatted

### Functionality
- [ ] Modal opens smoothly without lag
- [ ] Scrolling within modal works smoothly
- [ ] All tabs (Details, Metadata, History, etc.) are accessible
- [ ] Version history button works correctly
- [ ] Version history dialog displays properly

---

## 3. Video Annotation Testing

### Video Player
- [ ] Video loads and plays smoothly
- [ ] Play/pause controls are large enough for touch
- [ ] Timeline scrubber is easy to drag with finger
- [ ] Volume controls work correctly
- [ ] Fullscreen mode works on mobile

### Drawing Tools
- [ ] Drawing canvas responds to touch immediately
- [ ] Pen tool draws smooth lines with finger
- [ ] Highlight tool allows click-and-drag highlighting
- [ ] Arrow and bubble tools work with single tap
- [ ] Undo/redo buttons work correctly
- [ ] Toast notifications appear for undo/redo actions

### Voice Notes
- [ ] Voice recording button is accessible
- [ ] Recording box appears immediately below "Show Timeline"
- [ ] Microphone permission prompt appears correctly
- [ ] Recording indicator is visible during recording
- [ ] Stop recording button is easy to tap
- [ ] Recorded audio plays back correctly

### Annotations List
- [ ] Drawing Annotations section is collapsed by default
- [ ] Expanding/collapsing annotations works smoothly
- [ ] Annotation thumbnails display correctly
- [ ] Tapping annotation jumps to correct timestamp
- [ ] Delete annotation works correctly

### Bookmarks
- [ ] Bookmark button is accessible
- [ ] Bookmark dialog displays properly on mobile
- [ ] Color picker is easy to use with touch
- [ ] Bookmarks appear on timeline as colored markers
- [ ] Tapping bookmark jumps to correct timestamp
- [ ] Bookmark list displays correctly

---

## 4. Video Library Testing

### Grid Layout
- [ ] Videos display in appropriate grid (2-3 columns on mobile)
- [ ] Video thumbnails are clear and properly sized
- [ ] Video duration and metadata are visible
- [ ] Selection checkboxes are appropriately sized

### Video Actions
- [ ] Tapping video opens video player
- [ ] Long-press does not cause unwanted behavior
- [ ] Delete video works correctly
- [ ] Share video works correctly

---

## 5. Search Functionality Testing

### File Search
- [ ] Search input is large enough for typing
- [ ] Voice search button works (if microphone available)
- [ ] Search results display correctly
- [ ] Search filters work on mobile
- [ ] Clear search button works correctly

### Voice Note Search (New Feature)
- [ ] Voice search input is accessible
- [ ] Search across all voice transcripts works
- [ ] Search results highlight matching terms
- [ ] Tapping result jumps to correct video and timestamp

---

## 6. Upload & Camera Integration

### File Upload
- [ ] "Upload Files" button is accessible
- [ ] File picker opens correctly
- [ ] Multiple file selection works
- [ ] Upload progress is visible
- [ ] Upload completes successfully

### Camera Integration (Future)
- [ ] Camera button is accessible
- [ ] Camera permission prompt appears
- [ ] Photo capture works correctly
- [ ] Video recording works correctly
- [ ] Captured media uploads automatically

---

## 7. Performance Testing

### Load Times
- [ ] Initial page load is under 3 seconds
- [ ] File grid loads quickly (< 2 seconds for 50 files)
- [ ] Video player loads within 2 seconds
- [ ] Thumbnail generation is fast

### Responsiveness
- [ ] UI responds to touch within 100ms
- [ ] Scrolling is smooth (60fps)
- [ ] No lag when switching between pages
- [ ] Animations are smooth

### Battery & Data Usage
- [ ] App does not drain battery excessively
- [ ] Video streaming uses reasonable data
- [ ] Offline mode works (if implemented)

---

## 8. Accessibility Testing

### Touch Targets
- [ ] All buttons are at least 44x44px (iOS) or 48x48px (Android)
- [ ] Buttons have adequate spacing (8px minimum)
- [ ] No accidental taps on adjacent elements

### Text Readability
- [ ] Font sizes are readable (minimum 14px for body text)
- [ ] Contrast ratios meet WCAG AA standards
- [ ] Text does not require zooming

### Gestures
- [ ] Pinch-to-zoom works on images (future)
- [ ] Swipe gestures work correctly (future)
- [ ] Double-tap does not cause unwanted zoom

---

## 9. Edge Cases & Error Handling

### Network Issues
- [ ] Graceful handling of slow network
- [ ] Error messages are clear and helpful
- [ ] Retry mechanism works correctly
- [ ] Offline indicator appears when disconnected

### Large Files
- [ ] Large video files (> 100MB) upload correctly
- [ ] Large files do not crash the app
- [ ] Progress indicators work for large files

### Low Storage
- [ ] Warning appears when storage is low
- [ ] Clean Up Storage feature works correctly
- [ ] Files are deleted successfully

---

## 10. Cross-Browser Testing

### iOS Safari
- [ ] All features work correctly
- [ ] No layout issues
- [ ] Video playback works
- [ ] Audio recording works

### iOS Chrome
- [ ] All features work correctly
- [ ] No layout issues
- [ ] Video playback works
- [ ] Audio recording works

### Android Chrome
- [ ] All features work correctly
- [ ] No layout issues
- [ ] Video playback works
- [ ] Audio recording works

### Android Firefox
- [ ] All features work correctly
- [ ] No layout issues
- [ ] Video playback works
- [ ] Audio recording works

---

## Testing Notes

### Issues Found
Document any issues found during testing:

1. **Issue**: [Description]
   - **Device**: [Device name and OS version]
   - **Browser**: [Browser name and version]
   - **Steps to Reproduce**: [Steps]
   - **Expected**: [Expected behavior]
   - **Actual**: [Actual behavior]
   - **Severity**: [Critical/High/Medium/Low]

### Performance Metrics
Record performance metrics:

- **Page Load Time**: [X seconds]
- **Time to Interactive**: [X seconds]
- **First Contentful Paint**: [X seconds]
- **Largest Contentful Paint**: [X seconds]

---

## Sign-Off

- [ ] All critical issues resolved
- [ ] All high-priority issues resolved
- [ ] Performance meets targets
- [ ] Ready for production

**Tester**: _______________
**Date**: _______________
**Signature**: _______________
