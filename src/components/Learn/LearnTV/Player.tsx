import React, { useCallback, useEffect, useRef, useState } from 'react'
import MediaControls from 'components/MediaControls'
import OSButton from 'components/OSButton'
import type { LearnVideo } from './videos'
import './learnTV.css'

export interface TranscriptLine {
    id: string
    start: number
    text: string
}

/** What the player shares with the screen around it, so a transcript can follow the captions. */
export interface PlayerState {
    /** Every caption cue, by start time. */
    lines: TranscriptLine[]
    /** The cues on screen now. Overlapping cues can both be active. */
    activeIds: string[]
    /** Seek to a time and play. */
    playFrom: (time: number) => void
}

/**
 * The Learn TV player: a Cloudinary MP4 with a WebVTT captions track and the shared `MediaControls`. Both the
 * Learn TV window and product Learn hubs use it. `children` gets the caption cues, so a transcript matches the
 * captions exactly.
 */
export default function LearnTVPlayer({
    video,
    children,
}: {
    video: LearnVideo
    children?: (state: PlayerState) => React.ReactNode
}): JSX.Element {
    const videoRef = useRef<HTMLVideoElement>(null)
    const trackRef = useRef<HTMLTrackElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(100)
    const [isMuted, setIsMuted] = useState(false)
    const [playbackRate, setPlaybackRate] = useState(1)
    // On by default, the same as the site's other captioned player (WistiaCustomPlayer).
    const [captionsOn, setCaptionsOn] = useState(true)
    const [lines, setLines] = useState<TranscriptLine[]>([])
    const [activeIds, setActiveIds] = useState<string[]>([])
    // The MP4 failed to load (network or decode error). Play does nothing until a retry reloads the source.
    const [loadError, setLoadError] = useState(false)

    // Read the cues from the captions track. "hidden" still loads cues and fires cuechange, so a transcript
    // keeps following along when captions are off.
    useEffect(() => {
        const trackElement = trackRef.current
        const textTrack = trackElement?.track
        if (!trackElement || !textTrack) return
        textTrack.mode = captionsOn ? 'showing' : 'hidden'

        const readCues = () => {
            const cues = Array.from(textTrack.cues ?? []) as VTTCue[]
            setLines(
                cues
                    .map((cue, index) => ({
                        id: cue.id || String(index),
                        start: cue.startTime,
                        text: cue.text.replace(/\s*\n\s*/g, ' '),
                    }))
                    .sort((a, b) => a.start - b.start)
            )
        }
        const readActive = () => {
            const cues = Array.from(textTrack.activeCues ?? []) as VTTCue[]
            const all = Array.from(textTrack.cues ?? [])
            setActiveIds(cues.map((cue) => cue.id || String(all.indexOf(cue))))
        }

        if (trackElement.readyState === 2 && textTrack.cues?.length) readCues()
        trackElement.addEventListener('load', readCues)
        textTrack.addEventListener('cuechange', readActive)
        return () => {
            trackElement.removeEventListener('load', readCues)
            textTrack.removeEventListener('cuechange', readActive)
        }
    }, [captionsOn])

    const seek = useCallback((time: number) => {
        const el = videoRef.current
        if (!el) return
        el.currentTime = Math.max(0, Math.min(time, el.duration || time))
        setCurrentTime(el.currentTime)
    }, [])

    const togglePlay = () => {
        const el = videoRef.current
        if (!el) return
        if (el.paused) void el.play().catch(() => setIsPlaying(false))
        else el.pause()
    }

    // load() refetches the source, which play() alone does not do after a fatal error.
    const retry = () => {
        const el = videoRef.current
        if (!el) return
        setLoadError(false)
        el.load()
        void el.play().catch(() => setIsPlaying(false))
    }

    const playFrom = useCallback(
        (time: number) => {
            seek(time)
            void videoRef.current?.play().catch(() => setIsPlaying(false))
        },
        [seek]
    )

    const toggleMute = () => {
        const el = videoRef.current
        if (!el) return
        el.muted = !el.muted
        if (!el.muted && el.volume === 0) el.volume = 1
    }

    const toggleFullscreen = () => {
        const el = videoRef.current as any
        if (!el) return
        if (document.fullscreenElement) void document.exitFullscreen()
        else if (el.requestFullscreen) void el.requestFullscreen()
        else el.webkitEnterFullscreen?.()
    }

    return (
        <>
            {/* The same layout as components/MediaPlayer, with the shared controls */}
            <section className="@container bg-accent px-2 pb-2" aria-label={`Video: ${video.title}`}>
                <div className="relative flex-1 flex flex-col justify-center items-center bg-primary mb-2">
                    <video
                        ref={videoRef}
                        src={video.src}
                        poster={video.poster}
                        preload="metadata"
                        playsInline
                        aria-label={`${video.title}, a video from the ${video.series} series`}
                        className="learn-tv-video w-full aspect-video bg-black cursor-pointer"
                        onClick={togglePlay}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                        onLoadedMetadata={(e) => {
                            setLoadError(false)
                            setDuration(e.currentTarget.duration)
                        }}
                        onError={() => {
                            setLoadError(true)
                            setIsPlaying(false)
                        }}
                        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                        onRateChange={(e) => setPlaybackRate(e.currentTarget.playbackRate)}
                        onVolumeChange={(e) => {
                            setVolume(Math.round(e.currentTarget.volume * 100))
                            setIsMuted(e.currentTarget.muted || e.currentTarget.volume === 0)
                        }}
                    >
                        <track
                            ref={trackRef}
                            kind="captions"
                            srcLang="en"
                            label="English"
                            src={video.captions}
                            default
                        />
                        <a href={video.src}>Download video: {video.title}</a>
                    </video>
                    {loadError && (
                        <div
                            role="alert"
                            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center"
                        >
                            <p className="m-0 text-sm font-semibold text-white">The video didn't load.</p>
                            <OSButton variant="primary" size="md" onClick={retry}>
                                Try again
                            </OSButton>
                        </div>
                    )}
                </div>

                <MediaControls
                    currentTime={currentTime}
                    duration={duration}
                    isPlaying={isPlaying}
                    volume={volume}
                    isMuted={isMuted}
                    playbackRate={playbackRate}
                    onSeek={seek}
                    onTogglePlay={togglePlay}
                    onToggleMute={toggleMute}
                    onVolumeChange={(value) => {
                        const el = videoRef.current
                        if (!el) return
                        el.volume = value / 100
                        el.muted = el.volume === 0
                    }}
                    onPlaybackRateChange={(rate) => {
                        if (videoRef.current) videoRef.current.playbackRate = rate
                    }}
                    onFullscreen={toggleFullscreen}
                    captions={{ on: captionsOn, onToggle: () => setCaptionsOn((on) => !on) }}
                />
            </section>
            {children?.({ lines, activeIds, playFrom })}
        </>
    )
}
