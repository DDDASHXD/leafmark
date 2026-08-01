"use client";

import { useSmoothCorners, type SmoothCornerOptions } from "@lisse/react";
import NumericText from "@numeric-text/react";
import "@numeric-text/core/ssr.css";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "framer-motion";
import React from "react";

import { cn } from "@/lib/utils";

import {
  PROP_CHANGE_DURATION,
  PROP_CHANGE_EASE,
  READOUT_TRANSITION,
  STEP_SNAP_DURATION,
  STEP_SNAP_EASE,
  prefersReducedMotion,
  reservedChars,
} from "@/components/ui/slider-readout";

/** Playground defaults (https://corne.rs/playground) scaled for the track height. */
const DEFAULT_CORNERS: SmoothCornerOptions = {
  radius: 8,
  smoothing: 0.6,
  curve: "squircle",
};

const SMALL_CORNERS: SmoothCornerOptions = {
  radius: 6,
  smoothing: 0.6,
  curve: "squircle",
};

export type SliderSize = "default" | "small";

export type SliderProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "size"
> & {
  value?: number;
  defaultValue?: number;
  /** Shown inside the fill on the left; truncates with ellipsis when space is tight. */
  label?: string;
  /** Displayed before the value (e.g. "$"). */
  prefix?: string;
  /** Displayed after the value (e.g. "%", " px"). */
  suffix?: string;
  /** Target minimum spacing between visible stepper ticks in px. */
  tickSpacing?: number;
  /** Set to false to hide stepper ticks. */
  showTicks?: boolean;
  /** Set to false to hide the animated value readout. */
  showValue?: boolean;
  /** Lisse squircle corners — same options as https://corne.rs/playground */
  corners?: SmoothCornerOptions;
  /** Compact track: no ticks, label, or value readout. */
  size?: SliderSize;
  /** Animate the fill and readout to step positions instead of following the pointer continuously. */
  snapToSteps?: boolean;
};

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;
const DEFAULT_TICK_SPACING = 15;
const MIN_TICK_COUNT = 2;

const snapToStep = (value: number, min: number, max: number, step: number) => {
  if (max <= min) return min;
  if (step <= 0) return Math.min(max, Math.max(min, value));

  const steps = Math.round((value - min) / step);
  const snapped = min + steps * step;
  const decimals = Math.max(
    (step.toString().split(".")[1] ?? "").length,
    (min.toString().split(".")[1] ?? "").length,
    (max.toString().split(".")[1] ?? "").length,
  );
  const fixed = decimals > 0 ? Number(snapped.toFixed(decimals)) : snapped;
  return Math.min(max, Math.max(min, fixed));
};

const valueToRatio = (value: number, min: number, max: number) => {
  if (max <= min) return 0;
  return (value - min) / (max - min);
};

const ratioToValue = (ratio: number, min: number, max: number, step: number) =>
  snapToStep(min + ratio * (max - min), min, max, step);

const keyboardDirectionForKey = (key: string): -1 | 1 | null => {
  if (
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "+" ||
    key === "=" ||
    key === "End" ||
    key === "PageUp"
  ) {
    return 1;
  }

  if (
    key === "ArrowLeft" ||
    key === "ArrowDown" ||
    key === "-" ||
    key === "Home" ||
    key === "PageDown"
  ) {
    return -1;
  }

  return null;
};

const makeTickRatios = (
  min: number,
  max: number,
  step: number,
  width: number,
  tickSpacing: number,
) => {
  if (max <= min) return [0];

  const maxTickCount = Math.max(
    MIN_TICK_COUNT,
    Math.floor(width / Math.max(tickSpacing, 1)) + 1,
  );

  if (step <= 0) return [0, 1];

  const range = max - min;
  const stepCount = Math.max(1, Math.floor(range / step));
  const hasMaxStep = stepCount * step >= range;
  const stepRatio = (index: number) => clampRatio((index * step) / range);
  const totalTickCount = stepCount + (hasMaxStep ? 1 : 2);

  if (totalTickCount <= maxTickCount) {
    const ratios: number[] = [];
    for (let index = 0; index <= stepCount; index += 1) {
      ratios.push(stepRatio(index));
    }
    if (!hasMaxStep) ratios.push(1);
    return ratios;
  }

  const stride = Math.ceil((totalTickCount - 1) / (maxTickCount - 1));
  const visibleRatios: number[] = [];

  for (let index = 0; index <= stepCount; index += stride) {
    visibleRatios.push(stepRatio(index));
  }

  if (visibleRatios[visibleRatios.length - 1] !== 1) {
    visibleRatios.push(1);
  }

  return visibleRatios;
};

const toNumber = (value: string | number | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/** Stretch past min/max — width grows from the anchored edge only (no translate). */
const RUBBER_BAND_SCALE_X_GROW = 0.02;
const RUBBER_BAND_SCALE_Y_SQUISH = 0.07;
const RUBBER_BAND_STIFFNESS = 72;
const KEYBOARD_RUBBER_BAND_RATIO = 0.16;

const RUBBER_BAND_SPRING = {
  type: "spring" as const,
  stiffness: 520,
  damping: 32,
  mass: 0.75,
};

const rubberBandTransform = (rawRatio: number, trackWidth: number) => {
  if (rawRatio >= 0 && rawRatio <= 1) {
    return null;
  }

  const pastMax = rawRatio > 1;
  const overshootRatio = pastMax ? rawRatio - 1 : -rawRatio;
  const overshootPx = overshootRatio * trackWidth;
  const t = 1 - Math.exp(-overshootPx / RUBBER_BAND_STIFFNESS);

  return {
    scaleX: 1 + t * RUBBER_BAND_SCALE_X_GROW,
    scaleY: 1 - t * RUBBER_BAND_SCALE_Y_SQUISH,
    /** Anchor the opposite edge so the bar grows only toward the drag side. */
    origin: pastMax ? "left center" : "right center",
  } as const;
};

const clampRatio = (ratio: number) => Math.min(1, Math.max(0, ratio));

type SliderChromeProps = {
  displayedText: string;
  prefix: string;
  suffix: string;
  readoutMinWidth: string;
  tickRatios: number[];
  showTicks: boolean;
  showValue: boolean;
  label?: string;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
  tickClassName?: string;
};

const SliderChrome = ({
  displayedText,
  prefix,
  suffix,
  readoutMinWidth,
  tickRatios,
  showTicks,
  showValue,
  label,
  className,
  valueClassName,
  labelClassName,
  tickClassName,
}: SliderChromeProps) => (
  <div
    className={cn(
      "pointer-events-none absolute inset-0 flex items-center gap-2 px-2",
      label && showValue
        ? "justify-between"
        : label
          ? "justify-start"
          : showValue
            ? "justify-end"
            : "justify-start",
      className,
    )}
  >
    {label ? (
      <span
        className={cn("min-w-0 flex-1 truncate text-sm select-none", labelClassName)}
      >
        {label}
      </span>
    ) : null}
    {showValue ? (
      <span
        className={cn(
          "inline-flex shrink-0 justify-end text-sm whitespace-nowrap tabular-nums select-none",
          valueClassName,
        )}
        style={{ minWidth: readoutMinWidth }}
        aria-hidden
      >
        {prefix ? <span>{prefix}</span> : null}
        <NumericText value={displayedText} transition={READOUT_TRANSITION} />
        {suffix ? <span>{suffix}</span> : null}
      </span>
    ) : null}
    {showTicks && tickRatios.length > 0 ? (
      <div className="absolute inset-x-0 bottom-0 h-[5px]">
        {tickRatios.map((ratio, index) => (
          <div
            key={`${index}-${ratio}`}
            className={cn("absolute bottom-0 h-[5px] w-px rounded-full", tickClassName)}
            style={{ left: `${ratio * 100}%`, transform: "translateX(-50%)" }}
          />
        ))}
      </div>
    ) : null}
  </div>
);

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      value: valueProp,
      defaultValue,
      min = DEFAULT_MIN,
      max = DEFAULT_MAX,
      step = DEFAULT_STEP,
      disabled = false,
      label,
      prefix = "",
      suffix = "",
      tickSpacing = DEFAULT_TICK_SPACING,
      showTicks = true,
      showValue = true,
      snapToSteps = false,
      size = "default",
      corners = DEFAULT_CORNERS,
      className,
      style,
      onChange,
      onInput,
      onFocus,
      onBlur,
      onKeyDown,
      onKeyUp,
      id,
      name,
      form,
      list,
      required,
      autoFocus,
      readOnly,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      "aria-describedby": ariaDescribedBy,
      ...rest
    },
    ref,
  ) => {
    const isSmall = size === "small";
    const resolvedCorners = isSmall ? SMALL_CORNERS : corners;
    const resolvedShowTicks = isSmall ? false : showTicks;
    const resolvedShowValue = isSmall ? false : showValue;
    const resolvedLabel = isSmall ? undefined : label;

    const minValue = toNumber(min, DEFAULT_MIN);
    const maxValue = toNumber(max, DEFAULT_MAX);
    const stepValue = toNumber(step, DEFAULT_STEP);

    const isControlled = valueProp !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
      snapToStep(toNumber(defaultValue, minValue), minValue, maxValue, stepValue),
    );
    const value = isControlled
      ? snapToStep(valueProp, minValue, maxValue, stepValue)
      : uncontrolledValue;

    const shellRef = React.useRef<HTMLDivElement>(null);
    const [tickRatios, setTickRatios] = React.useState<number[]>([0, 1]);
    const trackRef = React.useRef<HTMLDivElement>(null);
    const fillRef = React.useRef<HTMLDivElement>(null);
    const overlayRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const isDragging = React.useRef(false);
    const isInteractive = !disabled && !readOnly;

    const bandScaleX = useMotionValue(1);
    const bandScaleY = useMotionValue(1);
    const [bandOrigin, setBandOrigin] = React.useState("center");

    const readoutMinWidth = React.useMemo(
      () =>
        `${reservedChars(minValue, maxValue, stepValue) + prefix.length + suffix.length}ch`,
      [minValue, maxValue, stepValue, prefix, suffix],
    );

    const reported = useMotionValue(value);
    const displayed = useTransform(reported, (v) =>
      String(snapToStep(v, minValue, maxValue, stepValue)),
    );
    const [displayedText, setDisplayedText] = React.useState(() => displayed.get());
    useMotionValueEvent(displayed, "change", (next) => {
      if (resolvedShowValue) setDisplayedText(next);
    });

    const propAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);
    const stepAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);
    const rubberBandAnimRef = React.useRef<ReturnType<typeof animate>[]>([]);
    const lastDragSteppedRef = React.useRef<number | null>(null);
    const keyboardRubberBandDirectionRef = React.useRef<-1 | 1 | null>(null);

    const stopPropAnim = React.useCallback(() => {
      if (propAnimRef.current) {
        propAnimRef.current.stop();
        propAnimRef.current = null;
      }
    }, []);

    const animateReportedTo = React.useCallback(
      (next: number, prev: number | null) => {
        if (stepAnimRef.current) {
          stepAnimRef.current.stop();
          stepAnimRef.current = null;
        }

        if (prefersReducedMotion()) {
          reported.set(next);
          return;
        }

        const stepsCrossed =
          prev === null ? 1 : Math.round(Math.abs(next - prev) / stepValue);

        if (stepsCrossed > 1) {
          reported.set(next);
          return;
        }

        stepAnimRef.current = animate(reported, next, {
          type: "tween",
          duration: STEP_SNAP_DURATION,
          ease: STEP_SNAP_EASE,
        });
      },
      [reported, stepValue],
    );

    React.useEffect(() => {
      if (isDragging.current) return;
      stopPropAnim();
      if (prefersReducedMotion()) {
        reported.set(value);
        return;
      }
      propAnimRef.current = animate(reported, value, {
        type: "tween",
        duration: PROP_CHANGE_DURATION,
        ease: PROP_CHANGE_EASE,
      });
      return () => {
        propAnimRef.current?.stop();
        propAnimRef.current = null;
      };
    }, [value, reported, stopPropAnim]);

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    React.useEffect(() => {
      if (isSmall) return;
      const shell = shellRef.current;
      if (!shell) return;

      const updateTickRatios = () => {
        const width = shell.getBoundingClientRect().width;
        setTickRatios(
          makeTickRatios(minValue, maxValue, stepValue, width, tickSpacing),
        );
      };

      updateTickRatios();
      const observer = new ResizeObserver(updateTickRatios);
      observer.observe(shell);
      return () => observer.disconnect();
    }, [tickSpacing, isSmall, minValue, maxValue, stepValue]);

    useSmoothCorners(trackRef, resolvedCorners);
    useSmoothCorners(fillRef, resolvedCorners);

    const setFillFromRatio = React.useCallback((ratio: number) => {
      const clamped = clampRatio(ratio);
      const fill = fillRef.current;
      if (fill) {
        fill.style.transform = `translateX(${(clamped - 1) * 100}%)`;
      }
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.style.clipPath = `inset(0 ${(1 - clamped) * 100}% 0 0)`;
      }
    }, []);

    const syncFillFromReported = React.useCallback(() => {
      const range = maxValue - minValue;
      const ratio = range === 0 ? 0 : (reported.get() - minValue) / range;
      setFillFromRatio(ratio);
    }, [reported, minValue, maxValue, setFillFromRatio]);

    useMotionValueEvent(reported, "change", () => {
      if (snapToSteps) syncFillFromReported();
    });

    const applyRubberBand = React.useCallback(
      (rawRatio: number) => {
        const shell = shellRef.current;
        if (!shell) return;

        const effect = rubberBandTransform(rawRatio, shell.offsetWidth);
        if (!effect) {
          bandScaleX.set(1);
          bandScaleY.set(1);
          setBandOrigin("center");
          return;
        }

        bandScaleX.set(effect.scaleX);
        bandScaleY.set(effect.scaleY);
        setBandOrigin(effect.origin);
      },
      [bandScaleX, bandScaleY],
    );

    const stopRubberBandSpring = React.useCallback(() => {
      rubberBandAnimRef.current.forEach((animation) => animation.stop());
      rubberBandAnimRef.current = [];
    }, []);

    const springRubberBandToRest = React.useCallback(() => {
      stopRubberBandSpring();
      const animations = [
        animate(bandScaleX, 1, RUBBER_BAND_SPRING),
        animate(bandScaleY, 1, RUBBER_BAND_SPRING),
      ];
      rubberBandAnimRef.current = animations;

      void Promise.all(animations).then(() => {
        if (rubberBandAnimRef.current !== animations) return;
        rubberBandAnimRef.current = [];
        setBandOrigin("center");
      });
    }, [bandScaleX, bandScaleY, stopRubberBandSpring]);

    const holdRubberBand = React.useCallback(
      (direction: -1 | 1) => {
        stopRubberBandSpring();
        keyboardRubberBandDirectionRef.current = direction;
        applyRubberBand(
          direction > 0 ? 1 + KEYBOARD_RUBBER_BAND_RATIO : -KEYBOARD_RUBBER_BAND_RATIO,
        );
      },
      [applyRubberBand, stopRubberBandSpring],
    );

    const releaseKeyboardRubberBand = React.useCallback(() => {
      if (keyboardRubberBandDirectionRef.current === null) return;
      keyboardRubberBandDirectionRef.current = null;
      springRubberBandToRest();
    }, [springRubberBandToRest]);

    const setFillFromValue = React.useCallback(
      (next: number) => {
        setFillFromRatio(valueToRatio(next, minValue, maxValue));
      },
      [minValue, maxValue, setFillFromRatio],
    );

    React.useEffect(() => {
      if (isDragging.current) return;
      if (!snapToSteps) setFillFromValue(value);
    }, [value, setFillFromValue, snapToSteps]);

    const fireInputEvent = React.useCallback(
      (next: number) => {
        const input = inputRef.current;
        if (!input) return;

        input.value = String(next);
        const event = {
          target: input,
          currentTarget: input,
        } as React.ChangeEvent<HTMLInputElement>;

        onInput?.(event as unknown as React.InputEvent<HTMLInputElement>);
        onChange?.(event);
      },
      [onInput, onChange],
    );

    const commitValue = React.useCallback(
      (next: number) => {
        const snapped = snapToStep(next, minValue, maxValue, stepValue);
        if (!isControlled) setUncontrolledValue(snapped);
        if (inputRef.current) inputRef.current.value = String(snapped);
        if (snapped !== value) fireInputEvent(snapped);
        return snapped;
      },
      [isControlled, minValue, maxValue, stepValue, value, fireInputEvent],
    );

    const handleHiddenChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = snapToStep(
          Number(event.target.value),
          minValue,
          maxValue,
          stepValue,
        );
        if (!isControlled) setUncontrolledValue(next);
        onChange?.(event);
      },
      [isControlled, minValue, maxValue, stepValue, onChange],
    );

    const handleHiddenInput = React.useCallback(
      (event: React.InputEvent<HTMLInputElement>) => {
        onInput?.(event);
      },
      [onInput],
    );

    const rawRatioFromClientX = React.useCallback((clientX: number) => {
      const shell = shellRef.current;
      if (!shell) return 0;

      const rect = shell.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return (clientX - rect.left) / rect.width;
    }, []);

    const updateFromPointer = React.useCallback(
      (clientX: number) => {
        const rawRatio = rawRatioFromClientX(clientX);
        applyRubberBand(rawRatio);
        const stepped = ratioToValue(
          clampRatio(rawRatio),
          minValue,
          maxValue,
          stepValue,
        );

        if (!snapToSteps) {
          setFillFromRatio(rawRatio);
        }

        if (stepped !== lastDragSteppedRef.current) {
          const prev = lastDragSteppedRef.current;
          lastDragSteppedRef.current = stepped;
          animateReportedTo(stepped, prev);
        }

        commitValue(stepped);
      },
      [
        rawRatioFromClientX,
        setFillFromRatio,
        applyRubberBand,
        commitValue,
        animateReportedTo,
        snapToSteps,
        minValue,
        maxValue,
        stepValue,
      ],
    );

    const finishPointer = React.useCallback(
      (clientX: number) => {
        const rawRatio = rawRatioFromClientX(clientX);
        const clamped = clampRatio(rawRatio);
        const stepped = ratioToValue(clamped, minValue, maxValue, stepValue);
        if (!snapToSteps) {
          setFillFromRatio(clamped);
        }
        commitValue(stepped);
        springRubberBandToRest();

        stopPropAnim();
        if (stepAnimRef.current) {
          stepAnimRef.current.stop();
          stepAnimRef.current = null;
        }
        lastDragSteppedRef.current = null;

        if (prefersReducedMotion()) {
          reported.set(stepped);
          if (snapToSteps) syncFillFromReported();
        } else if (snapToSteps) {
          propAnimRef.current = animate(reported, stepped, {
            type: "tween",
            duration: STEP_SNAP_DURATION,
            ease: STEP_SNAP_EASE,
          });
        } else {
          propAnimRef.current = animate(reported, stepped, {
            type: "tween",
            duration: PROP_CHANGE_DURATION,
            ease: PROP_CHANGE_EASE,
          });
        }
      },
      [
        rawRatioFromClientX,
        setFillFromRatio,
        commitValue,
        snapToSteps,
        syncFillFromReported,
        minValue,
        maxValue,
        stepValue,
        springRubberBandToRest,
        stopPropAnim,
        reported,
      ],
    );

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isInteractive) return;
      isDragging.current = true;
      stopPropAnim();
      if (stepAnimRef.current) {
        stepAnimRef.current.stop();
        stepAnimRef.current = null;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      const stepped = ratioToValue(
        clampRatio(rawRatioFromClientX(event.clientX)),
        minValue,
        maxValue,
        stepValue,
      );
      lastDragSteppedRef.current = stepped;
      reported.set(stepped);
      if (snapToSteps) syncFillFromReported();
      updateFromPointer(event.clientX);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isInteractive || !isDragging.current) return;
      updateFromPointer(event.clientX);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
      finishPointer(event.clientX);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLInputElement>);
      if (event.defaultPrevented || !isInteractive) return;

      let next: number | null = null;
      const direction = keyboardDirectionForKey(event.key);

      if (direction === 1 && (event.key === "End" || event.key === "PageUp")) {
        event.preventDefault();
        next =
          event.key === "End" ? maxValue : Math.min(maxValue, value + stepValue * 10);
      } else if (direction === 1) {
        event.preventDefault();
        next = Math.min(maxValue, value + stepValue);
      } else if (
        direction === -1 &&
        (event.key === "Home" || event.key === "PageDown")
      ) {
        event.preventDefault();
        next =
          event.key === "Home" ? minValue : Math.max(minValue, value - stepValue * 10);
      } else if (direction === -1) {
        event.preventDefault();
        next = Math.max(minValue, value - stepValue);
      }

      if (next === null) return;
      if (next === value && direction !== null) {
        holdRubberBand(direction);
        return;
      }
      releaseKeyboardRubberBand();

      const snapped = commitValue(next);
      if (snapToSteps) {
        animateReportedTo(snapped, value);
      } else {
        setFillFromValue(snapped);
      }
    };

    const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyUp?.(event as unknown as React.KeyboardEvent<HTMLInputElement>);
      if (keyboardDirectionForKey(event.key) !== null) {
        releaseKeyboardRubberBand();
      }
    };

    const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
      releaseKeyboardRubberBand();
      onBlur?.(event as unknown as React.FocusEvent<HTMLInputElement>);
    };

    return (
      <>
        <input
          {...rest}
          ref={inputRef}
          type="range"
          id={id}
          name={name}
          form={form}
          list={list}
          required={required}
          autoFocus={autoFocus}
          min={minValue}
          max={maxValue}
          step={stepValue}
          value={value}
          onChange={handleHiddenChange}
          onInput={handleHiddenInput}
          disabled={disabled}
          readOnly={readOnly}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
        <div
          ref={shellRef}
          role="slider"
          aria-label={ariaLabel ?? label}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-valuemin={minValue}
          aria-valuemax={maxValue}
          aria-valuenow={value}
          aria-valuetext={prefix || suffix ? `${prefix}${value}${suffix}` : undefined}
          aria-disabled={disabled || readOnly || undefined}
          aria-readonly={readOnly || undefined}
          tabIndex={isInteractive ? 0 : -1}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onFocus={onFocus}
          onBlur={handleBlur}
          style={style}
          className={cn(
            "group w-full touch-none overflow-visible select-none focus-visible:outline-none",
            isSmall ? "h-4 min-w-24" : "h-8 min-w-48",
            !isInteractive
              ? "pointer-events-none cursor-not-allowed opacity-50"
              : "cursor-pointer",
            className,
          )}
        >
          <motion.div
            ref={trackRef}
            className={cn(
              "bg-secondary group-focus-visible:ring-ring relative flex h-full w-full items-center justify-end overflow-visible transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-inset",
              isSmall ? "p-0.5 px-1" : "p-1 px-2",
            )}
            style={{
              scaleX: bandScaleX,
              scaleY: bandScaleY,
              transformOrigin: bandOrigin,
            }}
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                ref={fillRef}
                className="bg-primary absolute inset-0 size-full will-change-transform"
                style={{ transform: "translateX(-100%)" }}
              />
            </div>
            {!isSmall ? (
              <>
                <SliderChrome
                  displayedText={displayedText}
                  prefix={prefix}
                  suffix={suffix}
                  readoutMinWidth={readoutMinWidth}
                  tickRatios={tickRatios}
                  showTicks={resolvedShowTicks}
                  showValue={resolvedShowValue}
                  label={resolvedLabel}
                  className="z-10"
                  valueClassName="text-secondary-foreground"
                  labelClassName="text-secondary-foreground"
                  tickClassName="bg-muted-foreground/40"
                />
                <div
                  ref={overlayRef}
                  className="pointer-events-none absolute inset-0 z-20"
                  style={{ clipPath: "inset(0 100% 0 0)" }}
                >
                  <SliderChrome
                    displayedText={displayedText}
                    prefix={prefix}
                    suffix={suffix}
                    readoutMinWidth={readoutMinWidth}
                    tickRatios={tickRatios}
                    showTicks={resolvedShowTicks}
                    showValue={resolvedShowValue}
                    label={resolvedLabel}
                    valueClassName="text-primary-foreground"
                    labelClassName="text-primary-foreground"
                    tickClassName="bg-primary-foreground/50"
                  />
                </div>
              </>
            ) : null}
          </motion.div>
        </div>
      </>
    );
  },
);

Slider.displayName = "Slider";

export { Slider, snapToStep, valueToRatio, ratioToValue };
