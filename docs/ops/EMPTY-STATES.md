# Operational Runbook: UX Empty States & Fallback Handling

## Zero-State Behaviors

1. **First-Time Workspace Onboarding**:
   - When no custom Cubes exist, the system automatically presents the default seeded catalog (Maestro Coordinator, Work, Life Admin, Money, Learn, Job Hunt).
2. **Empty Message History**:
   - New threads display prompt starter suggestions tailored to the specific Cube's domain capability.
3. **Empty Schedules List**:
   - Displays a clean visual card explaining autonomous scheduling with a "Create First Schedule" action button.
4. **Missing AI API Keys**:
   - Opens the AI Provider Configuration dialog with clear instructions on entering an API key or running local Ollama.
5. **Jail Execution Without Files**:
   - The computer canvas displays an empty directory state with instructions on generating new files or running shell commands.
