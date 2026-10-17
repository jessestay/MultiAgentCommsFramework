# Cursor Multi-Role Extension: Visual Design

## Design Overview
The visual design for the Cursor Multi-Role Extension focuses on creating a minimal, unobtrusive interface that integrates seamlessly with Cursor's existing UI while providing clear visual cues for the multi-role system. The design prioritizes usability, accessibility, and consistency with Cursor's design language.

Key design principles:
- Seamless integration with Cursor's existing interface
- Minimal visual footprint when not in active use
- Clear role identification and status indicators
- Accessible design for all users
- Consistent with Cursor's design language

## Visual Identity

### Color Palette
We'll maintain the same role-specific colors established in our current system:

- **Executive Secretary (ES)**: Blue (#2D5BFF)
- **Software Engineering Team (SET)**: Orange (#FF6B2D)
- **Copy/Technical Writer (CTW)**: Green (#00A67E)
- **Designer (DES)**: Purple (#8A3FFC)

These colors will be used primarily for role indicators and accents, ensuring they integrate well with Cursor's existing color scheme.

### UI Elements

#### Role Switcher
- **Compact Dropdown/Toggle**: A small, unobtrusive dropdown in the Cursor chat interface
- **Role Indicators**: Color-coded icons or badges for each role
- **Active Role Highlight**: Clear visual indication of the currently active role
- **Keyboard Shortcut Hints**: Subtle indicators for keyboard shortcuts

#### Status Indicator
- **Persistent Badge**: Small color-coded badge indicating the active role
- **Tooltip**: Hover information showing role name and status
- **Status States**: Visual differentiation between active, loading, and error states

#### Settings Panel
- **Extension Settings**: Integrated into Cursor's existing settings interface
- **Role Configuration**: Collapsible sections for each role's settings
- **Visual Customization**: Options for adjusting visual elements
- **Accessibility Options**: Settings for color contrast, animation reduction, etc.

## User Interface Design

### Integration Points
1. **Chat Interface**: Small role indicator and switcher in the chat header
2. **Command Palette**: Commands for switching roles and accessing settings
3. **Status Bar**: Optional status indicator showing current role
4. **Settings Menu**: Extension settings panel

### Interaction Design
1. **Role Switching**:
   - Click/tap on role switcher
   - Select role from dropdown
   - Keyboard shortcuts (Alt+1, Alt+2, etc.)
   - Command palette commands

2. **Settings Access**:
   - Extension settings icon
   - Command palette command
   - Context menu option

3. **Visual Feedback**:
   - Subtle animation when switching roles
   - Color transition for role indicators
   - Loading state during initialization

### Responsive Considerations
- **Compact Mode**: Further simplified UI for smaller windows
- **Touch Optimization**: Larger touch targets for mobile/tablet use
- **Keyboard Focus**: Clear focus indicators for keyboard navigation

## Accessibility Considerations

- **Color Independence**: Role identification not solely dependent on color
- **High Contrast Mode**: Alternative visual indicators for high contrast settings
- **Screen Reader Support**: Proper ARIA labels and announcements
- **Keyboard Navigation**: Full keyboard support with visible focus indicators
- **Reduced Motion**: Option to disable animations

## Visual States

### Initial State
- Minimal presence in the UI
- Clear indication that the extension is active
- Default role selected

### Active Usage
- Current role clearly indicated
- Easy access to role switcher
- Visual differentiation in chat messages

### Configuration Mode
- Expanded settings interface
- Preview of visual changes
- Clear save/cancel actions

## Implementation Guidelines

### CSS Integration
- Use Cursor's CSS variables where available
- Implement extension-specific variables for customization
- Follow Cursor's component styling patterns

### Icon System
- Simple, recognizable icons for each role
- Consistent sizing and styling
- SVG format for scalability

### Animation Guidelines
- Subtle, purposeful animations
- 200-300ms duration for transitions
- Respect reduced motion preferences

## Design Deliverables

For implementation, we would provide:
- UI component specifications
- Icon assets for each role
- Color specifications with light/dark variants
- Interaction prototypes for key workflows
- Accessibility guidelines

## User Experience Flows

### Role Initialization Flow
1. User installs extension
2. Extension automatically initializes on first Cursor launch
3. Default role (ES) is activated
4. Subtle notification indicates successful initialization
5. Role indicator appears in UI

### Role Switching Flow
1. User clicks role indicator or uses keyboard shortcut
2. Role switcher expands showing available roles
3. User selects new role
4. Visual transition indicates role change
5. Chat interface updates to reflect new role
6. Role state is automatically persisted

### Configuration Flow
1. User accesses extension settings
2. Settings panel displays current configuration
3. User modifies role settings or preferences
4. Preview shows effect of changes
5. User saves changes
6. Configuration is persisted to storage

## Visual Mockups

Key interfaces to be designed include:

### Role Indicator
A compact indicator showing the current role:
```
┌────┐
│ ES │ ▼
└────┘
```

### Role Switcher Dropdown
An expanded view of available roles:
```
┌────┐
│ ES │ ▲
└────┘
┌────────────────────┐
│ ● ES - Executive   │
│ ○ SET - Software   │
│ ○ CTW - Writer     │
│ ○ DES - Designer   │
└────────────────────┘
```

### Settings Panel
Integrated into Cursor's settings:
```
┌───────────────────────────────┐
│ Multi-Role Extension Settings │
├───────────────────────────────┤
│ ▼ Role Configuration          │
│   ▼ Executive Secretary       │
│     [Configuration options]   │
│   △ Software Engineering      │
│   △ Copy/Technical Writer     │
│   △ Designer                  │
│                               │
│ ▼ Visual Preferences          │
│   [Theme options]             │
│   [Indicator position]        │
│                               │
│ ▼ Accessibility               │
│   [Accessibility options]     │
└───────────────────────────────┘
```

These designs ensure the extension provides a seamless, intuitive experience while maintaining the visual identity of our multi-role system within Cursor's interface. 