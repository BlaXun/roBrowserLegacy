# Effect lifetime and attachment direction fixes

This patch addresses four shared renderer defects. It changes no skill balance, sound mapping, game resource files, or inferred skill variant rules.

## Changes

- `endRepeat` matches the effect ID stored in `item._Params.Inst`. Previously it checked an unset top-level field, so selecting an effect ID could leave its persistent flag and scheduled repeats active. Owner and effect filters remain independent.
- STR expiration now advances before distance culling. It respects a supplied positive `endTick` and the STR frame count / FPS, even if the effect is offscreen or its resource finishes loading late. Future starts and internally persistent attachment loops are preserved; the manager still restarts explicitly repeated effect cycles.
- Attachment duration now applies before the STR branch. A looping STR attachment can consequently expire at its configured duration instead of returning before that check.
- Sprite attachments only disable automatic direction when `frame` is a finite number. `spamSprite` can supply `frame: undefined`; that previously disabled entity/camera direction merely because the property existed. Explicit frame zero still selects a fixed action.

## Validation

- Nine asset-free regression tests cover targeted repeat termination, native STR duration, explicit deadlines, delayed loading, future starts, persistent attachment loops, offscreen cleanup, repeat restart, attachment duration, and undefined-versus-zero frame selection.
- Against the unpatched source, six regression cases fail and three preservation cases pass. All nine pass with the fixes.
- The complete Vitest suite passes: 55 files, 344 tests.
- All application build targets pass (`npm run build:all`).
- ESLint and Prettier pass for the changed source files; Prettier also passes for the new test file.
- Existing local packet/status regression checks pass against the patched local bundle (161 cases). These local checks include preservation of existing status-based variant paths; they are additional evidence, not part of this repository's test suite.

The tests use synthetic resource metadata and dependency mocks to exercise the real source methods. They are not in-game audiovisual acceptance tests and do not establish official visual or audio fidelity.

## Scope and remaining uncertainty

Existing status-driven variant selection is retained. This patch does not guess original variant rules, frame/action mappings, or skill-specific phase timing. Those require separate evidence. It also does not claim that every skill now has its original visual and sound.

A broader local audit compared available resources to a kRO reference: 569 WAV files matched byte-for-byte. Byte equality establishes file provenance, not the correct skill association or playback timing. Resource restoration and skill-specific mappings from that local work are not included in this PR. No Gravity assets, GRF files, client executables, or private installation paths are distributed here.
