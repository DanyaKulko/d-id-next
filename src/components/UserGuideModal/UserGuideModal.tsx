"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./UserGuideModal.module.css";
import logo from "@/assets/img/neil_avatar_logo.png";

const SLIDES_DATA = [
  {
    id: 0,
    type: "welcome",
    content: (
      <>
        <div className={styles["na-slide-logo-modal"]}>
          <Image
            src={logo}
            alt="Neil Avatar Logo"
            width={200}
            height={200}
          />
        </div>
        <h1 className={styles["na-slide-title-modal"]}>
          Welcome to Neil AI Avatar
        </h1>
        <div className={styles["na-slide-text-modal"]}>
          <p>Before you is a digital copy of Neil's personality in 5 roles.</p>
          <p>
            On this site, you can talk to AI Neil by voice — just as if you were
            on a video call with him.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 1,
    step: 1,
    title: "Prepare for Conversation",
    content: (
      <>
        <div className={styles["na-slide-text-modal"]}>
          <p>
            Make sure you are ready to communicate with the Avatar just like a
            business video call.
          </p>
          <p>
            The room should be quiet, and the internet connection should be
            stable (Wi-Fi recommended).
          </p>
        </div>
        <div className={styles["na-slide-icon-modal"]}>🎧</div>
      </>
    ),
  },
  {
    id: 2,
    step: 2,
    title: "Choose Your Role",
    content: (
      <>
        <div className={styles["na-slide-text-modal"]}>
          <p>
            Select the role you're interested in talking about by clicking on
            the role tile.
          </p>
          <p>
            For example, if you want to talk about sports — choose the sports
            role. For general topics, choose the basic role.
          </p>
        </div>
        <div className={styles["na-slide-images-modal"]}>
          <Image
            src="https://roliki.ua/s/unimmunised1050.png"
            alt="Role Selection Example 1"
            width={640}
            height={360}
          />
          <Image
            src="https://roliki.ua/s/preloaded1554.png"
            alt="Role Selection Example 2"
            width={640}
            height={360}
          />
        </div>
      </>
    ),
  },
  {
    id: 3,
    step: 3,
    title: "Check Avatar Status",
    content: (
      <>
        <div className={styles["na-slide-text-modal"]}>
          <p>
            In the top left corner of the avatar, you will see its current
            status.
          </p>
          <p>
            For example, the avatar may be thinking about an answer or ready to
            hear a new question.
          </p>
        </div>
        <div className={styles["na-slide-screenshot-modal"]}>
          <Image
            src="https://roliki.ua/s/scooch2235.png"
            alt="Avatar Status"
            width={800}
            height={450}
          />
        </div>
      </>
    ),
  },
  {
    id: 4,
    step: 4,
    title: "Start Conversation",
    content: (
      <>
        <div className={styles["na-slide-text-modal"]}>
          <p>
            To start a conversation, select the language you want to speak with
            the Avatar.
          </p>
          <p>Then click the "Start Conversation" button.</p>
        </div>
        <div className={styles["na-slide-screenshots-modal"]}>
          <Image
            src="https://roliki.ua/s/flashbulb1343.png"
            alt="Language Selection"
            width={640}
            height={360}
          />
          <Image
            src="https://roliki.ua/s/locating1540.png"
            alt="Start Conversation Button"
            width={640}
            height={360}
          />
        </div>
      </>
    ),
  },
  {
    id: 5,
    step: 5,
    title: "Talk with the Avatar",
    content: (
      <>
        <div className={styles["na-slide-text-modal"]}>
          <p>
            Communicate with the Avatar by voice — just say what comes to mind,
            ask questions and have a dialogue.
          </p>
          <p>
            If the Avatar misunderstood you or is taking too long to respond,
            you can interrupt it with the "Interrupt Neil Avatar" button and
            formulate a new question.
          </p>
        </div>
        <div className={styles["na-slide-screenshot-modal"]}>
          <Image
            src="https://roliki.ua/s/tribesfolk2051.png"
            alt="Interrupt Button"
            width={800}
            height={450}
          />
        </div>
      </>
    ),
    isLast: true,
  },
];

export default function UserGuideModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
    console.log('isOpen',isOpen)

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasSeen = localStorage.getItem("neilAvatarGuideShown");
      if (hasSeen !== "true") {
        setIsOpen(true);
      }
    }
  }, []);

  const handleNext = useCallback(() => {
    setCurrentSlide((prev) =>
      prev < SLIDES_DATA.length - 1 ? prev + 1 : prev,
    );
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentSlide((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index);
  }, []);

  const closeGuide = useCallback(() => {
    localStorage.setItem("neilAvatarGuideShown", "true");
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Escape") closeGuide();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNext, handlePrev, closeGuide]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    touchEndX.current = e.changedTouches[0].screenX;
    handleSwipe();
  };

  const handleSwipe = () => {
    const swipeThreshold = 50;
    const diff = touchStartX.current - touchEndX.current;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  if (
    !isOpen
  ) {
    return null;
  }

  return (
    <div
      className={`${styles.container} ${styles.modalOverlay} ${isOpen ? styles.active : ""}`}
      role="dialog"
    >
      <div className={styles["na-modal-guide"]}>
        <div
          className={styles["na-carousel-modal"]}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {SLIDES_DATA.map((slide, index) => (
            <div
              key={slide.id}
              className={`${styles["na-slide-modal"]} ${index === currentSlide ? styles.active : ""}`}
            >
              <div className={styles["na-slide-content-modal"]}>
                {slide.step && (
                  <>
                    <div className={styles["na-slide-step-modal"]}>
                      Step {slide.step}
                    </div>
                    <h2 className={styles["na-slide-title-modal"]}>
                      {slide.title}
                    </h2>
                  </>
                )}

                {slide.content}

                {/* Кнопка на последнем слайде */}
                {slide.isLast && (
                  <div className={styles["na-modal-actions"]}>
                    <button
                      type="button"
                      className={`${styles["na-btn"]}`}
                      onClick={closeGuide}
                    >
                      Start Conversation
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className={styles["na-carousel-nav-modal"]}>
          <button
            type="button"
            className={`${styles["na-nav-btn-modal"]} ${styles["na-nav-prev-modal"]}`}
            onClick={handlePrev}
            disabled={currentSlide === 0}
          >
            <span>←</span>
          </button>

          <div className={styles["na-dots-modal"]} id="modalDots">
            {SLIDES_DATA.map((slide, index) => (
              <button
                type="button"
                key={slide.id}
                className={`${styles["na-dot-modal"]} ${index === currentSlide ? styles.active : ""}`}
                aria-label={`Go to slide ${index + 1}`}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>

          <button
            type="button"
            className={`${styles["na-nav-btn-modal"]} ${styles["na-nav-next-modal"]}`}
            onClick={handleNext}
            disabled={currentSlide === SLIDES_DATA.length - 1}
          >
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
