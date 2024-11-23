export function validateUsername(username: string | string[] | undefined) {
    if (!username) return 'Username is required.';
    if (typeof username !== 'string') return 'Username must be a string.';
    if (username.length < 4)
        return 'Username is too short (minimum 4 characters).';
    if (username.length > 40)
        return 'Username is too long (maximum 40 characters).';
    if (!/^[a-zA-Z0-9_-]+$/.test(username))
        return 'Username can only contain letters, numbers, underscores, and hyphens.';
    return true;
}

export function validatePassword(password: string | string[] | undefined) {
    if (!password) return 'Password is required.';
    if (typeof password !== 'string') return 'Password must be a string.';
    if (password.trim().length === 0)
        return 'Password cannot be empty or contain only blank spaces.';
    if (password.includes('  '))
        return 'Password cannot contain consecutive blank spaces.';
    if (password.length < 8)
        return 'Password is too short (minimum 8 characters).';
    if (password.length > 255)
        return 'Password is too long (maximum 255 characters).';
    if (!/[a-zA-Z]/.test(password))
        return 'Password must contain at least one letter.';
    if (!/\d/.test(password))
        return 'Password must contain at least one number.';

    return true;
}

export function validatePasswordMatch(
    password: string,
    confirmedPassword: string
) {
    if (password !== confirmedPassword) {
        return { success: false, message: 'Passwords do not match.' };
    } else {
        return { success: true };
    }
}
