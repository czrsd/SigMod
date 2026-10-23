import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

type PickerMode = 'date' | 'datetime';

type DatePickerControlProps = {
    label: string;
    value: string | null;
    onChange: (value: string | null) => void;
    mode: PickerMode;
    max?: string;
    clearable?: boolean;
    error?: string;
};

function dateParts(date: Date, utc: boolean) {
    return {
        year: utc ? date.getUTCFullYear() : date.getFullYear(),
        month: utc ? date.getUTCMonth() : date.getMonth(),
        day: utc ? date.getUTCDate() : date.getDate(),
        weekday: utc ? date.getUTCDay() : date.getDay(),
    };
}

function dateKey(date: Date, utc: boolean): string {
    const { year, month, day } = dateParts(date, utc);
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseSelected(value: string | null, mode: PickerMode): Date | null {
    if (!value) return null;
    if (mode === 'date') {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) return null;
        const [, year, month, day] = match;
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        return dateKey(date, true) === value ? date : null;
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function formatDate(date: Date, utc: boolean): string {
    const { year, month, day } = dateParts(date, utc);
    return `${String(day).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}.${year}`;
}

function toIso(date: Date, time: string): string | null {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
    return Number.isFinite(local.getTime()) ? local.toISOString() : null;
}

function DatePickerControl({ label, value, onChange, error, mode, max, clearable = true }: DatePickerControlProps) {
    const utc = mode === 'date';
    const validSelected = parseSelected(value, mode);
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => {
        const initial = validSelected ?? new Date();
        return utc
            ? new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1))
            : new Date(initial.getFullYear(), initial.getMonth(), 1);
    });
    const [time, setTime] = useState(
        validSelected
            ? `${String(validSelected.getHours()).padStart(2, '0')}:${String(validSelected.getMinutes()).padStart(2, '0')}`
            : '12:00'
    );
    const timeError =
        mode === 'datetime' && validSelected && !toIso(validSelected, time) ? 'Enter a valid time in 24-hour format (HH:MM).' : undefined;

    useEffect(() => {
        if (!validSelected) return;
        setTime(`${String(validSelected.getHours()).padStart(2, '0')}:${String(validSelected.getMinutes()).padStart(2, '0')}`);
    }, [value]);

    const days = useMemo(() => {
        const { year, month: monthIndex, weekday } = dateParts(month, utc);
        const offset = (weekday + 6) % 7;
        const count = utc ? new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate() : new Date(year, monthIndex + 1, 0).getDate();
        return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
    }, [month, utc]);

    const chooseDay = (day: number) => {
        const { year, month: monthIndex } = dateParts(month, utc);
        const date = utc ? new Date(Date.UTC(year, monthIndex, day)) : new Date(year, monthIndex, day);
        if (mode === 'date') {
            onChange(dateKey(date, true));
            setOpen(false);
            return;
        }
        const nextTime = validSelected ? time : '12:00';
        setTime(nextTime);
        onChange(toIso(date, nextTime));
        setOpen(false);
    };

    const changeTime = (next: string) => {
        const normalized = next.replace(/[^\d:]/g, '').slice(0, 5);
        setTime(normalized);
        if (mode === 'datetime' && validSelected) {
            const iso = toIso(validSelected, normalized);
            if (iso) onChange(iso);
        }
    };

    return (
        <div className="field custom-date-field">
            <label className="custom-date-label">{label}</label>
            <div className="custom-date-controls">
                <button
                    type="button"
                    className="custom-date-button"
                    aria-label={`${label}: ${validSelected ? formatDate(validSelected, utc) : 'choose date'}`}
                    onClick={() => {
                        if (!open) {
                            const current = validSelected ?? new Date();
                            setMonth(
                                utc
                                    ? new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1))
                                    : new Date(current.getFullYear(), current.getMonth(), 1)
                            );
                        }
                        setOpen((current) => !current);
                    }}
                >
                    <CalendarDays size={16} />
                    <span>{validSelected ? formatDate(validSelected, utc) : 'Choose date'}</span>
                </button>
                {mode === 'datetime' ? (
                    <input
                        aria-label={`${label} time`}
                        className="promo-time-input"
                        inputMode="numeric"
                        placeholder="12:00"
                        value={time}
                        onChange={(event) => changeTime(event.target.value)}
                        onBlur={() => {
                            if (!/^\d{2}:\d{2}$/.test(time))
                                setTime(
                                    validSelected
                                        ? `${String(validSelected.getHours()).padStart(2, '0')}:${String(validSelected.getMinutes()).padStart(2, '0')}`
                                        : '12:00'
                                );
                        }}
                    />
                ) : null}
                {clearable && value ? (
                    <button
                        type="button"
                        className="custom-date-clear"
                        aria-label={`Clear ${label.toLowerCase()}`}
                        onClick={() => onChange(null)}
                    >
                        <X size={15} />
                    </button>
                ) : null}
            </div>
            {open ? (
                <div className="custom-calendar" role="dialog" aria-label={`${label} calendar`}>
                    <div className="custom-calendar-header">
                        <button
                            type="button"
                            aria-label="Previous month"
                            onClick={() =>
                                setMonth((date) =>
                                    utc
                                        ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))
                                        : new Date(date.getFullYear(), date.getMonth() - 1, 1)
                                )
                            }
                        >
                            <ChevronLeft size={17} />
                        </button>
                        <strong>
                            {new Intl.DateTimeFormat(undefined, {
                                month: 'long',
                                year: 'numeric',
                                ...(utc ? { timeZone: 'UTC' } : {}),
                            }).format(month)}
                        </strong>
                        <button
                            type="button"
                            aria-label="Next month"
                            onClick={() =>
                                setMonth((date) =>
                                    utc
                                        ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
                                        : new Date(date.getFullYear(), date.getMonth() + 1, 1)
                                )
                            }
                        >
                            <ChevronRight size={17} />
                        </button>
                    </div>
                    <div className="custom-calendar-grid">
                        {weekdays.map((day) => (
                            <span className="custom-weekday" key={day}>
                                {day}
                            </span>
                        ))}
                        {days.map((day, index) =>
                            day ? (
                                <button
                                    type="button"
                                    key={day}
                                    className={
                                        validSelected &&
                                        dateParts(validSelected, utc).year === dateParts(month, utc).year &&
                                        dateParts(validSelected, utc).month === dateParts(month, utc).month &&
                                        dateParts(validSelected, utc).day === day
                                            ? 'selected'
                                            : ''
                                    }
                                    disabled={Boolean(
                                        max &&
                                        utc &&
                                        dateKey(new Date(Date.UTC(dateParts(month, utc).year, dateParts(month, utc).month, day)), true) >
                                            max
                                    )}
                                    onClick={() => chooseDay(day)}
                                >
                                    {day}
                                </button>
                            ) : (
                                <span key={`empty-${index}`} />
                            )
                        )}
                    </div>
                    <div className="custom-calendar-footer">{utc ? 'Dates use UTC.' : 'Time uses your local timezone.'}</div>
                </div>
            ) : null}
            {error || timeError ? (
                <span className="field-error" role="alert">
                    {error || timeError}
                </span>
            ) : null}
        </div>
    );
}

export function CustomDateTimePicker(props: Omit<DatePickerControlProps, 'mode' | 'max'>) {
    return <DatePickerControl {...props} mode="datetime" />;
}

export function CustomDatePicker(props: Omit<DatePickerControlProps, 'mode'>) {
    return <DatePickerControl {...props} mode="date" />;
}
