---
name: unity-csharp-standards
description: C# coding standards and architecture guidelines for Unity 6 and Unity MCP workflows.
---
When generating or refactoring Unity 6 C# scripts:
1. Use `[SerializeField] private` instead of public fields for Inspector exposure.
2. Prefer the Unity New Input System, clean component separation, and null-safe references.
3. Keep scripts modular and deterministic so they integrate cleanly with Unity MCP scene operations.
