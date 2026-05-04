'use client';
import Image from "next/image";
import { JSX, useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { CroppedButton } from "../ui/cropped-button";
import { RandomRevealText } from "../ui/random-reveal-text";
import { FaArrowRight } from "react-icons/fa";

export default function LandingTextContent(): JSX.Element {
    const section_ref = useRef<HTMLElement>(null);

    const { scrollYProgress } = useScroll({
        target: section_ref,
        offset: ['start end', 'start start'],
    });

    const heading_y = useTransform(scrollYProgress, [0, 1], [60, 0]);
    const image_y = useTransform(scrollYProgress, [0, 1], [150, 0]);
    const image_scale = useTransform(scrollYProgress, [0, 1], [1.25, 1]);

    return (
        <main ref={section_ref} className="relative z-20 w-screen min-h-[110vh] bg-[#ff4000]">
            <motion.h1
                style={{ y: heading_y }}
                className="mx-auto text-center text-6xl py-16 text-black mt-12"
            >
                Explore the first application live on Arcium.
            </motion.h1>
            <motion.section
                style={{ y: image_y, scale: image_scale }}
                className="relative z-30 w-full max-w-5xl aspect-3024/1964 mx-auto"
            >
                <Image src="/images/assets/event.png" fill alt="event-image" className="rounded-3xl" />
            </motion.section>
            <div className="flex items-center justify-center gap-x-6 mx-auto w-full py-12 mt-8">
                <h1 className="text-6xl text-center text-black">
                    <RandomRevealText text="Umbra: Incognito mode for Solana" />
                </h1>
                <CroppedButton size={'lg'} className="bg-black text-white">
                    <span>Start trading</span>
                    <FaArrowRight />
                </CroppedButton>
            </div>
        </main>
    )
}
