# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# code-style
- Keep Kotlin source files under 500 lines of code; split oversized files into smaller utility modules. Confidence: 0.70

# hooks
- Configure Command Code hooks for agent behavior customization instead of relying solely on skills/taste/AGENTS.md. Use https://commandcode.ai/docs/hooks as reference. Confidence: 0.60
- Route all shell commands through the `rtk` prefix by configuring a PreToolUse hook in `.commandcode/settings.json`. Confidence: 0.65

# ci
- Regenerate Gradle wrapper in CI using `gradle wrapper --gradle-version <version>` before running `./gradlew` to bypass repository's corrupt LFS wrapper JAR. Confidence: 0.85

