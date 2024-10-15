# Diode (Upwork Project)

Hi friends! My goal with this project is to transform an incoming video torrent into a source readable by the Shaka web player. I'm starting with a narrow scope of MKV files only, and using WebTorrent to turn the torrent into a webserver that hosts the MKV file at a local web URL. Any arbitrary byte range of the file can be accessed via the `Range` header, which WebTorrent will fetch and respond with with when that range is ready.

I will handle the complexity of the dynamic byte ranges later. For the sake of this work, I only want to focus on streaming chunks of an MKV directly into Shaka Player. **I do not want any solutions that require any transcoding. I also do not want to read the entire file**.

My first step in this process was to understand the MKV format.

- As I understand, the header points to the cuepoints section, which almost always lives at the end of the file. For now, I used `mkvextract sample_turtle_hevc.mkv cues 0:cues.txt`
- The cues point to I-frames, which we can safely split the file on.

I have successfully used these byte ranges to split the video into playable MKV segments by combining the header bytes with the I-frame segment I'm interested in.

- For example, if I want the 3rd segment in `cues.txt`, I would read in bytes `0 to 3446` bytes (so VLC or FFmpeg knows what format it is looking at) along with `2218740 to 2323656` (I-frame 3 to 4) and write that combination out to `segments/2.mkv`
- I made a NodeJS script that automates this at `mkv-fragmenter.js` and writes out all I-frame segments.

Next I made a webserver that:

1. Serves shaka player & related HTML / JS files.
1. Generates an HLS manifest based on the CUE file.
1. Muxes the segments on demand. To do this we use FFmpeg and read `segments/<segment_number>.mkv`, while piping the output to the HTTP response.

- Everything _ALMOST_ works perfectly, however there is currently a slight gap / delay between the segments during playback.
- This gap is noticeable between the 0:07 and 0:08 mark, suggesting potential issues with timecode handling during playback
- My guess is that FFmpeg isn't handling timecodes correctly because I broke up the MKV files.

I'm seeking assistance from an experienced developer to pinpoint the root cause of these gaps and provide possible solutions to ensure a seamless streaming experience.

## Development Workflow

To test the current setup, follow these steps:

1. Run `node mkv-fragmenter.js sample_turtle_hevc.mkv`. This also runs mkvextract as a child process, and writes out cues.txt. Feel free to try this on your own videos
1. Launch the server with `node server.js` and navigate to `http://localhost:3000` to observe playback.
