import logging
from typing import Dict, Any, List
try:
    from escpos.printer import Network, Serial, Usb, Dummy
except ImportError:
    # Handle environment where python-escpos might not be installed yet
    class Dummy: pass
    Network = Serial = Usb = Dummy

logger = logging.getLogger("kindpos.printing.escpos_formatter")

class ESCPOSFormatter:
    """
    Translates template commands into raw ESC/POS printer commands.
    Uses python-escpos library.

    Supported command types:
      text     - content, bold, double_width, double_height, align, red, reverse, font
      feed     - lines
      divider  - char
      cut      - partial
    """

    def __init__(self, paper_width: int = 80):
        self.paper_width = paper_width
        self.chars_per_line = 48 if paper_width == 80 else 32

    def format(self, commands: List[Dict[str, Any]]) -> bytes:
        """Process formatting commands and return raw bytes."""
        # Use a Dummy printer to capture the raw bytes
        try:
            p = Dummy()
            # Set codepage to PC858 (Latin 1 + Euro) or PC850
            # Volcora and most modern ESC/POS printers support PC858
            try:
                p.charcode('PC858')
            except:
                try:
                    p.charcode('PC850')
                except:
                    logger.warning("Could not set codepage to PC858 or PC850, falling back to default")
        except:
            return b"!! python-escpos not installed !!"

        for cmd in commands:
            cmd_type = cmd.get('type')

            if cmd_type == 'text':
                content = cmd.get('content', '')
                bold = cmd.get('bold', False)
                double_width = cmd.get('double_width', False)
                double_height = cmd.get('double_height', False)
                align = cmd.get('align', 'left')  # left, center, right
                red = cmd.get('red', False)
                reverse = cmd.get('reverse', False)
                font = cmd.get('font', 'a')  # 'a' (normal) or 'b' (small)

                # Color: ESC r n (0=black, 1=red)
                if red:
                    p._raw(b'\x1b\x72\x01')

                # Reverse print: GS B n (0=off, 1=on)
                if reverse:
                    p._raw(b'\x1d\x42\x01')

                # Calculate width/height multipliers
                width = 2 if double_width else 1
                height = 2 if double_height else 1

                p.set(
                    align=align,
                    bold=bold,
                    width=width,
                    height=height,
                    font=font,
                )
                p.text(f"{content}\n")

                # Reset reverse
                if reverse:
                    p._raw(b'\x1d\x42\x00')

                # Reset color
                if red:
                    p._raw(b'\x1b\x72\x00')

            elif cmd_type == 'feed':
                p.ln(cmd.get('lines', 1))

            elif cmd_type == 'divider':
                char = cmd.get('char', '-')
                p.text(char * self.chars_per_line + "\n")

            elif cmd_type == 'cut':
                p.cut()

            # Reset after each command for safety
            p.set(align='left', bold=False, width=1, height=1, font='a')

        return p.output
