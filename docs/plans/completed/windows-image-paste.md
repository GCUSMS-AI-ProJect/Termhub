# Windows Image Paste Compatibility

The running ThemeFix build was confirmed and the current clipboard contained
PixPin DIB image formats. A native probe using the production arboard version
reproduced `ConversionFailure` on this clipboard, despite Windows recognizing it
as an image. This was a real local decoding failure before any SSH transfer.

Changes:

- Fall back to Windows CF_BITMAP synthesis and GDI decoding when arboard cannot
  read the image. Keep the existing 64 MiB decoded-image limit, convert BGRA to
  opaque RGBA, and release clipboard/DC resources without deleting its bitmap.
- Inspect raw Ctrl+V terminal input and empty native paste events, which may
  bypass DOM shortcut handlers. Preserve literal Ctrl+V once when no image exists.
- Record paste stages in local app.log without recording clipboard bytes or text.

Native image decoding and renderer routing are validated separately from the
user's real remote CLI; an SSH end-to-end result must not be claimed from either
of those checks alone.

The live PixPin clipboard probe reproduced arboard ConversionFailure and then
successfully decoded the same image through GDI: 435x286 pixels, 497640 RGBA bytes.
