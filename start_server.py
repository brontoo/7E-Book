"""One-click local preview, safely bound to this computer only (localhost)."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser
import socket

ROOT=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.webp':'image/webp','.mjs':'text/javascript','.js':'text/javascript'}
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)

if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    port=server.server_address[1]
    url=f'http://localhost:{port}/index.html'
    print('THE SEVEN EMIRATES | FULL HD GESTURE BOOK',flush=True)
    print('Local website:',url,flush=True)
    print('Use Chrome/Edge. Press Ctrl+C to stop the server.',flush=True)
    threading.Timer(1.0,lambda:webbrowser.open(url)).start()
    try: server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
