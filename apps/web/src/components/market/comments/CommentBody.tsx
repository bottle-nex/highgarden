'use client';
import { JSX, ReactNode } from 'react';

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

const IMAGE_HOST_RE =
    /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)?(giphy\.com|tenor\.com|imgur\.com|gfycat\.com)\b/i;
const IMAGE_EXT_RE = /\.(gif|gifv|png|jpe?g|webp|svg)(\?[^\s]*)?$/i;

function is_image_url(url: string): boolean {
    if (IMAGE_EXT_RE.test(url)) return true;
    if (IMAGE_HOST_RE.test(url)) return true;
    return false;
}

function normalize_image_src(url: string): string {
    // Tenor often returns view URLs (/view/foo); the actual gif lives at media.tenor.com.
    // Imgur .gifv -> .gif. Most other hosts already serve direct gifs.
    if (url.endsWith('.gifv')) return url.slice(0, -1);
    return url;
}

interface Props {
    body: string;
}

export default function CommentBody({ body }: Props): JSX.Element {
    const nodes: ReactNode[] = [];
    let last_index = 0;
    let key = 0;

    for (const match of body.matchAll(URL_REGEX)) {
        const url = match[0];
        const start = match.index ?? 0;

        if (start > last_index) {
            nodes.push(body.slice(last_index, start));
        }

        if (is_image_url(url)) {
            nodes.push(
                <a
                    key={key++}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block w-fit overflow-hidden rounded-md border border-white/10 hover:border-white/20 transition-colors"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={normalize_image_src(url)}
                        alt=""
                        loading="lazy"
                        className="block max-w-[320px] max-h-[320px] object-contain"
                    />
                </a>,
            );
        } else {
            nodes.push(
                <a
                    key={key++}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-yellow-300/80 hover:text-yellow-300 underline underline-offset-2 wrap-break-word"
                >
                    {url}
                </a>,
            );
        }

        last_index = start + url.length;
    }

    if (last_index < body.length) {
        nodes.push(body.slice(last_index));
    }

    return (
        <p className="text-[14px] leading-[1.55] text-white/80 wrap-break-word whitespace-pre-wrap">
            {nodes}
        </p>
    );
}
