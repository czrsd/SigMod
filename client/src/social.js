    class ProfileController extends FeatureController {
        constructor(app, name) {
            super(app, name);
            this.profile = null;
            this.events = new Emitter();
            this.authenticating = null;
        }
        async mount() {
            this.menu = this.app.features.get('menu');
            this.modal = this.app.features.get('modal');
            this.root = this.menu?.root ?? null;
            this.resources.add(this.app.backend.on('auth-required', (sid) => this.authenticate(sid)));
            if (this.root instanceof HTMLElement) {
                this.resources.listen(this.root, 'click', (event) => this.handleMenuClick(event));
            }
            this.renderSummary(null);
        }
        /** Subscribe to profile changes. @param {(profile: object|null) => void} listener */
        onChange(listener) {
            return this.events.on('change', listener);
        }
        /** Perform a credentialed request against the SigMod application API. */
        async request(path, init = {}) {
            const token = localStorage.getItem('mod_accessToken');
            const refreshToken = localStorage.getItem('mod_refreshToken');
            const headers = new Headers(init.headers || {});
            if (token) headers.set('Authorization', `Bearer ${token}`);
            if (refreshToken) headers.set('x-refresh-token', refreshToken);
            
            const response = await fetch(`${ENDPOINTS.app}${path}`, {
                credentials: 'omit',
                ...init,
                headers
            });
            
            const newAccessToken = response.headers.get('x-new-access-token');
            if (newAccessToken) {
                localStorage.setItem('mod_accessToken', newAccessToken);
            }
            
            let payload = null;
            try {
                payload = await response.json();
            } catch {
                throw new Error(`The SigMod server returned an invalid response (HTTP ${response.status}).`);
            }
            if (!response.ok) {
                const error = new Error(String(payload?.message ?? `HTTP ${response.status}`));
                error.payload = payload;
                throw error;
            }
            return payload;
        }
        /** Exchange a Sigmally session id for the existing SigMod account cookie. */
        authenticate(sid) {
            if (!sid || this.authenticating) return this.authenticating;
            this.authenticating = this.request(`/auth/?sid=${encodeURIComponent(String(sid))}`)
                .then((payload) => {
                    if (!payload?.success || !isObject(payload.user)) return false;
                    this.applyAccount(payload.user, payload.settings);
                    return true;
                })
                .catch((error) => {
                    this.app.logger.warnOnce('mod-account-auth', 'Unable to authenticate the SigMod account', error);
                    return false;
                })
                .finally(() => {
                    this.authenticating = null;
                });
            return this.authenticating;
        }
        /** Update profile state, compatibility fields, storage, and all dependent views. */
        applyAccount(profile, settings = undefined) {
            if (!isObject(profile)) return;
            this.profile = profile;
            if (isObject(settings)) this.app.state.friends.settings = { ...settings };
            this.app.settingsStore.set('modAccount.authorized', true, true);
            this.renderSummary(profile);
            this.events.emit('change', profile);
        }
        clearAccount() {
            this.profile = null;
            this.app.state.friends.settings = {};
            this.app.state.friends.names = new Set();
            this.app.settingsStore.set('modAccount.authorized', false, true);
            this.renderSummary(null);
            this.events.emit('change', null);
        }
        renderSummary(profile) {
            if (!(this.root instanceof HTMLElement)) return;
            const imageRoot = this.root.querySelector('#mod-profile-img');
            const name = this.root.querySelector('#my-profile-name');
            const role = this.root.querySelector('#my-profile-role');
            const bio = this.root.querySelector('#my-profile-bio');
            const badges = this.root.querySelector('#my-profile-badges');
            if (imageRoot instanceof HTMLElement) {
                imageRoot.replaceChildren();
                if (profile) {
                    imageRoot.append(this.createAvatar(profile, 50));
                } else {
                    imageRoot.innerHTML = icon('userCircle', 24);
                }
            }
            if (name) name.textContent = String(profile?.username ?? 'Guest');
            if (role) {
                role.textContent = String(profile?.role ?? 'Guest');
                role.className = profile?.role ? `${String(profile.role)}_role` : '';
            }
            if (bio) bio.textContent = String(profile?.bio || (profile ? 'No bio.' : 'No Bio.'));
            if (badges instanceof HTMLElement) {
                badges.replaceChildren();
                if (profile) {
                    const values = Array.isArray(profile.badges) ? profile.badges : [];
                    if (values.length) {
                        for (const badge of values)
                            badges.append(
                                createElement('span', {
                                    className: 'mod_badge',
                                    text: badge,
                                })
                            );
                    } else
                        badges.append(
                            createElement('span', {
                                text: 'User has no badges.',
                            })
                        );
                }
            }
        }
        createAvatar(user, size = 44) {
            const image = createElement('img', {
                attributes: {
                    alt: `${String(user?.username ?? 'User')} profile picture`,
                    draggable: 'false',
                    width: size,
                    height: size,
                    referrerpolicy: 'no-referrer',
                },
            });
            image.src = this.safeImageUrl(user?.imageURL);
            image.onerror = () => {
                image.onerror = null;
                image.src = 'https://czrsd.com/static/sigmod/SigMod25-rounded.png';
            };
            return image;
        }
        safeImageUrl(value) {
            const source = String(value ?? '');
            return safeHttpUrl(source, true) ?? (/^data:image\/(?:png|jpe?g|gif|webp);/i.test(source) ? source : '');
        }
        handleMenuClick(event) {
            const target = event.target instanceof Element ? event.target.closest('[data-profile-edit]') : null;
            if (target) this.openEditor();
        }
        /** Display a public profile returned by /profile/:id. */
        async showProfile(id) {
            if (!id) return;
            try {
                const payload = await this.request(`/profile/${encodeURIComponent(String(id))}`);
                if (!payload?.success || !isObject(payload.user)) throw new Error(String(payload?.message ?? 'Profile not found.'));
                const user = payload.user;
                const body = createElement('div', {
                    className: 'signIn-wrapper',
                });
                const header = createElement('div', {
                    className: 'signIn-header',
                });
                header.append(
                    createElement('span', {
                        text: `Profile of ${String(user.username ?? 'user')}`,
                    })
                );
                const closeWrap = createElement('div', {
                    className: 'centerXY sigmod-modal-close-wrap',
                });
                const close = createElement('button', {
                    className: 'modButton-black',
                    attributes: { type: 'button', 'aria-label': 'Close' },
                });
                close.innerHTML = icon('close', 20);
                closeWrap.append(close);
                header.append(closeWrap);
                const content = createElement('div', {
                    className: 'signIn-body sigmod-profile-body',
                });
                const identity = createElement('div', {
                    className: 'friends_row',
                });
                const identityLeft = createElement('div', {
                    className: 'centerY g-5',
                });
                const profileImage = createElement('div', {
                    className: 'profile-img',
                });
                profileImage.append(this.createAvatar(user, 64));
                profileImage.append(
                    createElement('span', {
                        className: `status_icon ${user.online ? 'online_icon' : 'offline_icon'}`,
                    })
                );
                identityLeft.append(
                    profileImage,
                    createElement('div', {
                        className: 'f-big',
                        text: user.username ?? 'Unknown user',
                    })
                );
                const identityRight = createElement('div', {
                    className: 'centerY g-10',
                });
                identityRight.append(
                    createElement('div', {
                        className: user.role ? `${user.role}_role` : '',
                        text: user.role ?? 'user',
                    })
                );
                identity.append(identityLeft, identityRight);
                const badges = createElement('div', {
                    className: 'mod_badges',
                });
                const badgeValues = Array.isArray(user.badges) ? user.badges : [];
                if (badgeValues.length) {
                    for (const badge of badgeValues)
                        badges.append(
                            createElement('span', {
                                className: 'mod_badge',
                                text: badge,
                            })
                        );
                } else badges.append(createElement('span', { text: 'User has no badges.' }));
                const details = createElement('div', {
                    className: 'f-column g-5 w-100',
                });
                details.append(
                    createElement('strong', { text: 'Bio:' }),
                    createElement('p', {
                        text: user.bio || 'User has no bio.',
                    }),
                    createElement('strong', { text: 'Badges:' }),
                    badges
                );
                if (user.lastOnline)
                    details.append(
                        createElement('strong', { text: 'Last online:' }),
                        createElement('span', {
                            text: this.formatDate(user.lastOnline),
                        })
                    );
                content.append(identity, details);
                body.append(header, content);
                this.modal?.open('profile-view', body, {
                    className: 'signIn-wrapper',
                });
                const scope = this.modal?.modals.get('profile-view')?.scope;
                scope?.listen(close, 'click', () => this.modal.close('profile-view'));
            } catch (error) {
                this.modal?.alert(error.message || 'Unable to load the profile.', 'danger');
            }
        }
        formatDate(value) {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? String(value ?? '') : date.toLocaleString();
        }
        /** Open the safe profile editor, including avatar upload/removal. */
        openEditor() {
            if (!this.profile) {
                this.modal?.alert('Sign in before editing a profile.', 'info');
                return;
            }
            const body = createElement('div', { className: 'signIn-wrapper' });
            const header = createElement('div', { className: 'signIn-header' });
            header.append(createElement('span', { text: 'Edit mod profile' }));
            const closeWrap = createElement('div', {
                className: 'centerXY sigmod-modal-close-wrap',
            });
            const close = createElement('button', {
                className: 'modButton-black',
                attributes: { type: 'button', 'aria-label': 'Close' },
            });
            close.innerHTML = icon('close', 20);
            closeWrap.append(close);
            header.append(closeWrap);
            const form = createElement('form', {
                className: 'signIn-body sigmod-profile-edit-form',
            });
            const avatar = this.createAvatar(this.profile, 96);
            const avatarRow = createElement('div', {
                className: 'centerXY g-10',
            });
            const avatarWrap = createElement('div', {
                className: 'profile-img sigmod-profile-edit-avatar',
            });
            avatarWrap.append(avatar);
            const avatarActions = createElement('div', {
                className: 'f-column g-5',
            });
            const upload = createElement('input', {
                attributes: {
                    type: 'file',
                    accept: 'image/*',
                    name: 'avatar',
                    id: 'imageUpload',
                },
            });
            const uploadLabel = createElement('label', {
                className: 'modButton-black g-10',
                attributes: { for: 'imageUpload' },
            });
            uploadLabel.innerHTML = `${icon('camera', 18)}Upload avatar`;
            const remove = createElement('button', {
                className: 'modButton-black g-10',
                attributes: {
                    type: 'button',
                    'data-profile-remove-avatar': '',
                    id: 'deleteAvatar',
                },
            });
            remove.innerHTML = `${icon('trash', 18)}Delete avatar`;
            avatarActions.append(upload, uploadLabel, remove);
            avatarRow.append(avatarWrap, avatarActions);
            const usernameGroup = createElement('div', {
                className: 'f-column w-100',
            });
            const username = createElement('input', {
                className: 'form-control',
                attributes: {
                    type: 'text',
                    name: 'username',
                    id: 'username_edit',
                    minlength: 4,
                    maxlength: 40,
                    value: this.profile.username ?? '',
                },
            });
            usernameGroup.append(
                createElement('label', {
                    text: 'Username',
                    attributes: { for: 'username_edit' },
                }),
                username
            );
            const bioGroup = createElement('div', {
                className: 'f-column w-100',
            });
            const bioWrap = createElement('div', {
                className: 'textarea-container',
            });
            const bio = createElement('textarea', {
                className: 'form-control',
                attributes: {
                    name: 'bio',
                    id: 'bio_edit',
                    maxlength: 250,
                    placeholder: "Hello! I'm ...",
                },
            });
            bio.value = String(this.profile.bio ?? '');
            const count = createElement('span', {
                className: 'char-counter',
                text: `${bio.value.length}/250`,
                attributes: { id: 'charCount' },
            });
            bioWrap.append(bio, count);
            bioGroup.append(
                createElement('label', {
                    text: 'Bio',
                    attributes: { for: 'bio_edit' },
                }),
                bioWrap
            );
            const errorText = createElement('p', {
                attributes: { role: 'status' },
            });
            const save = createElement('button', {
                className: 'modButton-black',
                text: 'Save changes',
                attributes: {
                    type: 'submit',
                    id: 'saveChanges',
                    style: 'margin-bottom: 20px;',
                },
            });
            form.append(avatarRow, usernameGroup, bioGroup, errorText, save);
            body.append(header, form);
            this.modal?.open('profile-editor', body, {
                className: 'signIn-wrapper',
                closeOnBackdrop: true,
            });
            const scope = this.modal?.modals.get('profile-editor')?.scope;
            scope?.listen(close, 'click', () => this.modal.close('profile-editor'));
            scope?.listen(bio, 'input', () => {
                count.textContent = `${bio.value.length}/250`;
            });
            scope?.listen(upload, 'change', async () => {
                const file = upload.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('image', file);
                await this.runEditorAction(errorText, async () => {
                    const payload = await this.request('/me/upload', {
                        method: 'POST',
                        body: formData,
                    });
                    if (!payload?.success || !isObject(payload.user)) throw new Error(String(payload?.message ?? 'Avatar upload failed.'));
                    this.applyAccount(payload.user);
                    avatar.src = this.safeImageUrl(payload.user.imageURL);
                });
            });
            scope?.listen(remove, 'click', async () => {
                if (!confirm('Remove your profile picture?')) return;
                await this.runEditorAction(errorText, async () => {
                    const payload = await this.request('/me/remove');
                    if (!payload?.success || !isObject(payload.user)) throw new Error(String(payload?.message ?? 'Avatar removal failed.'));
                    this.applyAccount(payload.user);
                    avatar.src = this.safeImageUrl(payload.user.imageURL);
                });
            });
            scope?.listen(form, 'submit', async (event) => {
                event.preventDefault();
                const changes = [];
                const data = {};
                if (username.value !== String(this.profile?.username ?? '')) {
                    changes.push('username');
                    data.username = username.value.trim();
                }
                if (bio.value !== String(this.profile?.bio ?? '')) {
                    changes.push('bio');
                    data.bio = bio.value;
                }
                if (!changes.length) return;
                await this.runEditorAction(
                    errorText,
                    async () => {
                        save.disabled = true;
                        const payload = await this.request('/me/edit', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ changes, data }),
                        });
                        if (!payload?.success || !isObject(payload.user))
                            throw new Error(String(payload?.message ?? 'Profile update failed.'));
                        this.applyAccount(payload.user);
                        this.modal.close('profile-editor');
                    },
                    () => {
                        save.disabled = false;
                    }
                );
            });
        }
        async runEditorAction(status, action, done = null) {
            status.textContent = '';
            try {
                await action();
            } catch (error) {
                status.textContent = error.message || 'The profile update failed.';
            } finally {
                done?.();
            }
        }
        /** Render and submit the legacy username/password account flow. */
        openAccountDialog(login) {
            const body = createElement('div', { className: 'signIn-wrapper' });
            const header = createElement('div', { className: 'signIn-header' });
            header.append(
                createElement('span', {
                    text: login ? 'Login' : 'Create an account',
                })
            );
            const closeWrap = createElement('div', {
                className: 'centerXY sigmod-modal-close-wrap',
            });
            const close = createElement('button', {
                className: 'modButton-black',
                attributes: { type: 'button', 'aria-label': 'Close' },
            });
            close.innerHTML = icon('close', 20);
            closeWrap.append(close);
            header.append(closeWrap);
            const form = createElement('form', { className: 'signIn-body' });
            const username = createElement('input', {
                className: 'form-control',
                attributes: {
                    type: 'text',
                    autocomplete: 'username',
                    placeholder: 'Username',
                    required: '',
                },
            });
            const password = createElement('input', {
                className: 'form-control',
                attributes: {
                    type: 'password',
                    autocomplete: login ? 'current-password' : 'new-password',
                    placeholder: 'Password',
                    required: '',
                },
            });
            const confirmation = login
                ? null
                : createElement('input', {
                      className: 'form-control',
                      attributes: {
                          type: 'password',
                          autocomplete: 'new-password',
                          placeholder: 'Confirm password',
                          required: '',
                      },
                  });
            const status = createElement('div', {
                attributes: { role: 'status' },
            });
            const submit = createElement('button', {
                className: 'modButton-black',
                text: login ? 'Login' : 'Create account',
                attributes: { type: 'submit' },
            });
            form.append(username, password);
            if (confirmation) form.append(confirmation);
            form.append(status);
            const alternate = createElement('span', {
                text: 'or continue with...',
            });
            const discord = createElement('button', {
                className: 'dclinks',
                attributes: { type: 'button', id: 'discord_login' },
            });
            discord.innerHTML =
                '<svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.4566 5.35132C21.7154 8.83814 22.8309 12.7712 22.4139 17.299C22.4121 17.3182 22.4026 17.3358 22.3876 17.3473C20.6771 18.666 19.0199 19.4663 17.3859 19.9971C17.3732 20.0011 17.3596 20.0009 17.347 19.9964C17.3344 19.992 17.3234 19.9835 17.3156 19.9721C16.9382 19.4207 16.5952 18.8393 16.2947 18.2287C16.2774 18.1928 16.2932 18.1495 16.3287 18.1353C16.8734 17.9198 17.3914 17.6615 17.8896 17.3557C17.9289 17.3316 17.9314 17.2725 17.8951 17.2442C17.7894 17.1617 17.6846 17.0751 17.5844 16.9885C17.5656 16.9725 17.5404 16.9693 17.5191 16.9801C14.2844 18.5484 10.7409 18.5484 7.46792 16.9801C7.44667 16.9701 7.42142 16.9735 7.40317 16.9893C7.30317 17.0759 7.19817 17.1617 7.09342 17.2442C7.05717 17.2725 7.06017 17.3316 7.09967 17.3557C7.59792 17.6557 8.11592 17.9198 8.65991 18.1363C8.69517 18.1505 8.71192 18.1928 8.69442 18.2287C8.40042 18.8401 8.05742 19.4215 7.67292 19.9729C7.65617 19.9952 7.62867 20.0055 7.60267 19.9971C5.97642 19.4663 4.31917 18.666 2.60868 17.3473C2.59443 17.3358 2.58418 17.3174 2.58268 17.2982C2.23418 13.3817 2.94442 9.41613 5.53717 5.35053C5.54342 5.33977 5.55292 5.33137 5.56392 5.32638C6.83967 4.71165 8.20642 4.25939 9.63491 4.00111C9.66091 3.99691 9.68691 4.00951 9.70041 4.03365C9.87691 4.36176 10.0787 4.78252 10.2152 5.12637C11.7209 4.88489 13.2502 4.88489 14.7874 5.12637C14.9239 4.78987 15.1187 4.36176 15.2944 4.03365C15.3007 4.02167 15.3104 4.01208 15.3221 4.00623C15.3339 4.00039 15.3471 3.99859 15.3599 4.00111C16.7892 4.26018 18.1559 4.71244 19.4306 5.32638C19.4419 5.33137 19.4511 5.33977 19.4566 5.35132ZM10.9807 12.798C10.9964 11.6401 10.1924 10.6821 9.18316 10.6821C8.18217 10.6821 7.38592 11.6317 7.38592 12.798C7.38592 13.9639 8.19792 14.9136 9.18316 14.9136C10.1844 14.9136 10.9807 13.9639 10.9807 12.798ZM17.6261 12.798C17.6419 11.6401 16.8379 10.6821 15.8289 10.6821C14.8277 10.6821 14.0314 11.6317 14.0314 12.798C14.0314 13.9639 14.8434 14.9136 15.8289 14.9136C16.8379 14.9136 17.6261 13.9639 17.6261 12.798Z" fill="currentColor"></path></svg><span>Discord</span>';
            const captcha = createElement('div', {
                attributes: { id: 'sigmod-captcha' },
            });
            const submitWrapper = createElement('div', {
                className: 'w-100 centerXY',
            });
            submit.classList.add('sigmod-auth-submit');
            submitWrapper.append(submit);
            const privacy = createElement('p', {
                className: 'mt-auto',
                text: 'Your data is stored safely and securely.',
            });
            form.append(alternate, discord, captcha, submitWrapper, privacy);
            body.append(header, form);
            this.modal?.open('mod-account', body, {
                className: 'signIn-wrapper',
                closeOnBackdrop: true,
            });
            const scope = this.modal?.modals.get('mod-account')?.scope;
            scope?.listen(close, 'click', () => this.modal.close('mod-account'));
            scope?.listen(discord, 'click', () => {
                const width = 600;
                const height = 800;
                const left = Math.max(0, (window.innerWidth - width) / 2);
                const top = Math.max(0, (window.innerHeight - height) / 2);
                const popup = window.open(ENDPOINTS.discordAuth, '_blank', `width=${width},height=${height},left=${left},top=${top}`);
                if (!popup) {
                    status.textContent = 'The Discord login popup was blocked by your browser.';
                    return;
                }
                
                const messageHandler = (event) => {
                    if (event.source !== popup) return;
                    if (event.data && event.data.type === 'SIGMOD_AUTH_SUCCESS') {
                        const { accessToken, refreshToken } = event.data.payload || {};
                        if (accessToken) localStorage.setItem('mod_accessToken', accessToken);
                        if (refreshToken) localStorage.setItem('mod_refreshToken', refreshToken);
                        this.app.settingsStore.set('modAccount.authorized', true, true);
                    }
                };
                window.addEventListener('message', messageHandler);

                const interval = window.setInterval(() => {
                    if (!popup.closed) return;
                    window.clearInterval(interval);
                    window.removeEventListener('message', messageHandler);
                    this.resources.timeout(() => location.reload(), 1_500);
                }, 1_000);
                scope?.add(() => window.clearInterval(interval));
            });
            scope?.listen(form, 'submit', async (event) => {
                event.preventDefault();
                status.replaceChildren();
                submit.disabled = true;
                try {
                    const accountData = {
                        username: username.value,
                        password: password.value,
                        user: this.app.state.user,
                    };
                    if (confirmation) accountData.confirmedPassword = confirmation.value;
                    const payload = await this.request(login ? '/login' : '/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(accountData),
                    });
                    if (!payload?.success || !isObject(payload.user)) {
                        const errors = Array.isArray(payload?.errors)
                            ? payload.errors
                            : [
                                  {
                                      message: payload?.message ?? 'Sign-in failed.',
                                  },
                              ];
                        for (const error of errors)
                            status.append(
                                createElement('p', {
                                    text: error?.message ?? error,
                                })
                            );
                        return;
                    }
                    this.applyAccount(payload.user, payload.settings);
                    this.modal.close('mod-account');
                } catch (error) {
                    const errors = Array.isArray(error?.payload?.errors) ? error.payload.errors : null;
                    if (errors?.length) {
                        for (const item of errors)
                            status.append(
                                createElement('p', {
                                    text: item?.message ?? item,
                                })
                            );
                    } else status.textContent = error.message || 'Sign-in failed.';
                } finally {
                    submit.disabled = false;
                }
            });
        }
        async logout() {
            try {
                const payload = await this.request('/logout');
                if (!payload?.success) throw new Error(String(payload?.message ?? 'Logout failed.'));
                this.clearAccount();
                location.reload();
            } catch (error) {
                this.modal?.alert(error.message || 'Unable to log out.', 'danger');
            }
        }
        destroy() {
            this.modal?.close('profile-view');
            this.modal?.close('profile-editor');
            this.modal?.close('mod-account');
            this.events.clear();
            super.destroy();
        }
    }
    /** Friends, discovery, requests, settings, and one-to-one chat. */
    class FriendPresenceTracker {
        constructor(app, controller) {
            this.app = app;
            this.controller = controller;
            this.localFriendState = {
                favorites: new Set(),
                notes: {},
                lastOnlineAt: {},
            };
        }
        get profileController() {
            return this.controller.profileController;
        }
        loadLocalFriendState() {
            const accountId = String(this.profileController?.profile?._id ?? 'guest');
            const parsed = readLocalJson(STORAGE.friendsLocal, {});
            const root = isObject(parsed) ? parsed : {};
            const account = isObject(root[accountId]) ? root[accountId] : {};
            this.localFriendState = {
                favorites: new Set(Array.isArray(account.favorites) ? account.favorites.map(String) : []),
                notes: isObject(account.notes) ? { ...account.notes } : {},
                lastOnlineAt: isObject(account.lastOnlineAt) ? { ...account.lastOnlineAt } : {},
            };
        }
        saveLocalFriendState() {
            const accountId = String(this.profileController?.profile?._id ?? 'guest');
            const parsed = readLocalJson(STORAGE.friendsLocal, {});
            const root = isObject(parsed) ? parsed : {};
            root[accountId] = {
                favorites: [...this.localFriendState.favorites].slice(0, 500),
                notes: Object.fromEntries(
                    Object.entries(this.localFriendState.notes)
                        .filter(([id, note]) => id && String(note).trim())
                        .slice(-500)
                        .map(([id, note]) => [id, String(note).slice(0, 60)])
                ),
                lastOnlineAt: Object.fromEntries(
                    Object.entries(this.localFriendState.lastOnlineAt)
                        .filter(([id, value]) => id && Number.isFinite(Number(value)))
                        .sort((a, b) => Number(b[1]) - Number(a[1]))
                        .slice(0, 500)
                ),
            };
            if (!writeLocalJson(STORAGE.friendsLocal, root)) {
                this.app.logger.warnOnce('friends-local-state', 'Unable to save local Friends preferences');
            }
        }
        trackFriendPresence(friends) {
            let changed = false;
            const now = Date.now();
            for (const friend of friends) {
                const id = String(friend?._id ?? friend?.id ?? '');
                if (!id || !friend?.online) continue;
                const previous = Number(this.localFriendState.lastOnlineAt[id] || 0);
                if (now - previous > 30_000) {
                    this.localFriendState.lastOnlineAt[id] = now;
                    changed = true;
                }
            }
            if (changed) this.saveLocalFriendState();
        }
        friendPresenceText(user) {
            if (user?.online) return user?.server ? `Online · ${user.server}` : 'Online';
            const id = String(user?._id ?? user?.id ?? '');
            const last = Number(this.localFriendState.lastOnlineAt[id] || 0);
            if (!last) return 'Offline';
            return `Seen ${this.formatRelativeTime(last)}`;
        }
        formatRelativeTime(value) {
            const seconds = Math.max(0, Math.floor((Date.now() - Number(value || 0)) / 1000));
            if (seconds < 45) return 'just now';
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m ago`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours}h ago`;
            const days = Math.floor(hours / 24);
            return days < 30 ? `${days}d ago` : 'a while ago';
        }
    }

    class PrivateChatView {
        constructor(app, resources, controller) {
            this.app = app;
            this.resources = resources;
            this.controller = controller;
            this.sessionMessages = new Map();
            this.unreadMessages = new Map();
        }
        get activeChat() {
            return this.controller.activeChat;
        }
        get body() {
            return this.controller.body;
        }
        get container() {
            return this.controller.container;
        }
        get profileController() {
            return this.controller.profileController;
        }
        get activeView() {
            return this.controller.activeView;
        }
        notify(msg, type) {
            return this.controller.notify(msg, type);
        }
        renderFriendsList() {
            return this.controller.renderFriendsList();
        }
        sendPrivateMessage(value) {
            const text = String(value ?? '').trim();
            if (!this.activeChat || !text || text.length > 200) return false;
            const sent = this.app.backend.send('private-message', {
                text,
                target: this.activeChat.id,
            });
            if (!sent) this.notify('Private chat is disconnected. Try again after reconnecting.', 'danger');
            else
                this.rememberMessage(
                    this.activeChat.id,
                    {
                        text,
                        mine: true,
                        at: Date.now(),
                    },
                    false
                );
            return sent;
        }
        updatePrivateChat(data) {
            if (!isObject(data)) return;
            const selfId = String(this.profileController?.profile?._id ?? '');
            const sender = String(data.sender_id ?? '');
            const target = String(data.target_id ?? data.target ?? '');
            const remoteId = sender && sender !== selfId ? sender : target;
            if (remoteId) {
                const mine = sender === selfId;
                this.rememberMessage(
                    remoteId,
                    {
                        text: String(data.message ?? data.content ?? '').slice(0, 200),
                        mine,
                        at: data.timestamp ?? Date.now(),
                    },
                    !mine && this.activeChat?.id !== remoteId
                );
            }
            if (!this.activeChat) return;
            if (sender !== this.activeChat.id && target !== this.activeChat.id) return;
            const messages = this.body?.querySelector('[data-private-messages]');
            if (!(messages instanceof HTMLElement)) return;
            this.markFriendRead(this.activeChat.id);
            this.appendMessage(messages, data);
            messages.scrollTop = messages.scrollHeight;
        }
        appendMessage(container, data) {
            container.querySelector('[data-chat-empty]')?.remove();
            const message = createElement('div', {
                className: 'friends-message',
            });
            if (String(data.sender_id ?? '') === String(this.profileController?.profile?._id ?? '')) message.classList.add('message-right');
            message.append(
                createElement('span', {
                    text: data.message ?? data.content ?? '',
                }),
                createElement('span', {
                    className: 'message-date',
                    text: this.formatMessageTime(data.timestamp),
                })
            );
            container.append(message);
        }
        formatMessageTime(value) {
            const date = new Date(value ?? Date.now());
            return Number.isNaN(date.getTime())
                ? ''
                : date.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                  });
        }
        totalUnread() {
            let total = 0;
            for (const value of this.unreadMessages.values()) total += Math.max(0, Number(value) || 0);
            return total;
        }
        updateUnreadBadge() {
            const badge = this.container?.querySelector('[data-friends-unread-badge]');
            if (!(badge instanceof HTMLElement)) return;
            const total = this.totalUnread();
            badge.hidden = total <= 0;
            badge.textContent = total > 99 ? '99+' : String(total);
        }
        rememberMessage(id, message, unread = false) {
            if (!id) return;
            const text = String(message?.text ?? '').trim();
            if (text) {
                this.sessionMessages.set(String(id), {
                    text: text.slice(0, 100),
                    mine: Boolean(message?.mine),
                    at: Number(message?.at) || Date.now(),
                });
            }
            if (unread) this.unreadMessages.set(String(id), Number(this.unreadMessages.get(String(id)) || 0) + 1);
            this.updateUnreadBadge();
            if (this.activeView === 'friends') this.renderFriendsList();
        }
        markFriendRead(id) {
            if (!id) return;
            this.unreadMessages.delete(String(id));
            this.updateUnreadBadge();
            if (this.activeView === 'friends') this.renderFriendsList();
        }
    }

    class FriendSettingsPanel {
        constructor(app, resources, controller) {
            this.app = app;
            this.resources = resources;
            this.controller = controller;
        }
        get body() {
            return this.controller.body;
        }
        get profileController() {
            return this.controller.profileController;
        }
        get viewRevision() {
            return this.controller.viewRevision;
        }
        get viewScope() {
            return this.controller.viewScope;
        }
        get colorTimer() {
            return this.controller.colorTimer;
        }
        set colorTimer(v) {
            this.controller.colorTimer = v;
        }
        isCurrent(revision) {
            return this.controller.isCurrent(revision);
        }
        beginView(scope) {
            return this.controller.beginView(scope);
        }
        updateSetting(type, data) {
            return this.controller.updateSetting(type, data);
        }
        openSettings() {
            this.beginView('settings');
            const profile = this.profileController?.profile;
            const settings = this.app.state.friends.settings;
            this.body.replaceChildren();

            const account = createElement('div', {
                className: 'friends-account-card',
            });
            const accountIdentity = createElement('div', {
                className: 'friends-account-identity',
            });
            const accountText = createElement('div', {
                className: 'friends-account-text',
            });
            accountText.append(
                createElement('strong', { text: profile?.username ?? 'User' }),
                createElement('span', {
                    text: profile?.nick || 'SigMod account',
                })
            );
            accountIdentity.append(this.profileController.createAvatar(profile, 44), accountText);
            account.append(
                accountIdentity,
                createElement('button', {
                    className: 'modButton-black friends-edit-profile',
                    text: 'Edit profile',
                    attributes: {
                        type: 'button',
                        'data-friend-action': 'edit-profile',
                    },
                })
            );
            this.body.append(account);

            const settingsCard = createElement('div', {
                className: 'friends-settings-card',
            });
            settingsCard.append(
                this.createSettingSelect(
                    'Status',
                    'static_status',
                    [
                        ['online', 'Online'],
                        ['offline', 'Offline'],
                    ],
                    settings.static_status ?? 'online'
                ),
                this.createSettingCheckbox('Accept friend requests', 'accept_requests', Boolean(settings.accept_requests)),
                this.createSettingCheckbox('Highlight friends', 'highlight_friends', Boolean(settings.highlight_friends))
            );
            const colorRow = createElement('label', {
                className: 'friends-setting-row',
            });
            colorRow.append(createElement('span', { text: 'Highlight color' }));
            const color = createElement('div', {
                className: 'friends-highlight-color',
                attributes: { id: 'friendsHighlightColor' },
            });
            color.append(
                createElement('input', {
                    className: 'friends-highlight-color-fallback',
                    attributes: {
                        type: 'color',
                        name: 'highlight_color',
                        value: settings.highlight_color || '#ffff00',
                        'data-friend-setting': '',
                        'aria-label': 'Highlight color',
                    },
                })
            );
            colorRow.append(color);
            settingsCard.append(colorRow, this.createSettingCheckbox('Public profile', 'visible', Boolean(profile?.visible)));
            this.body.append(settingsCard);

            const logout = createElement('div', {
                className: 'friends-logout-row',
            });
            logout.append(
                createElement('span', { text: 'Sign out of SigMod' }),
                createElement('button', {
                    className: 'modButton-black friends-logout-button',
                    text: 'Logout',
                    attributes: {
                        type: 'button',
                        'data-friend-action': 'logout',
                    },
                })
            );
            this.body.append(logout);

            const revision = this.viewRevision;
            this.app.dependencies
                .load('colorPicker')
                .then((Alwan) => this.upgradeFriendsColorPicker(Alwan, revision))
                .catch((error) =>
                    this.app.logger.warnOnce(
                        'friends-color-picker',
                        'Unable to load Friends color picker; native input remains available',
                        error
                    )
                );
        }
        upgradeFriendsColorPicker(Alwan, revision) {
            if (!this.isCurrent(revision) || typeof Alwan !== 'function' || !(this.body instanceof HTMLElement)) return;
            const container = this.body.querySelector('#friendsHighlightColor');
            if (!(container instanceof HTMLElement)) return;

            const fallbackChildren = [...container.childNodes].map((node) => node.cloneNode(true));
            const fallback = '#ffff00';
            const current = /^#[0-9a-f]{6}$/i.test(String(this.app.state.friends.settings.highlight_color ?? ''))
                ? String(this.app.state.friends.settings.highlight_color).slice(0, 7)
                : fallback;
            container.replaceChildren();

            let picker;
            try {
                picker = new Alwan('#friendsHighlightColor', {
                    id: 'edit-friendsHighlightColor',
                    color: current,
                    theme: 'dark',
                    opacity: false,
                    format: 'hex',
                    default: fallback,
                    swatches: ['black', 'white', 'red', 'blue', 'green'],
                });
            } catch (error) {
                container.replaceChildren(...fallbackChildren);
                this.app.logger.warnOnce('friends-highlight-color-picker', 'Unable to initialize Friends highlight color picker', error);
                return;
            }

            const pickerElement = document.getElementById('edit-friendsHighlightColor');
            if (pickerElement instanceof HTMLElement) {
                const reset = createColorPickerReset('Reset highlight color');
                pickerElement.append(reset.container);
                this.viewScope?.listen(reset.button, 'click', () => {
                    if (typeof picker.setColor === 'function') picker.setColor(fallback);
                    clearTimeout(this.colorTimer);
                    void this.updateSetting('highlight_color', fallback);
                });
            }

            if (typeof picker.on === 'function') {
                picker.on('change', (event) => {
                    if (!this.isCurrent(revision)) return;
                    const value = /^#[0-9a-f]{6}/i.test(String(event?.hex ?? '')) ? String(event.hex).slice(0, 7) : null;
                    if (!value) return;
                    clearTimeout(this.colorTimer);
                    this.colorTimer = window.setTimeout(() => void this.updateSetting('highlight_color', value), 400);
                });
            }

            this.viewScope?.add(() => {
                clearTimeout(this.colorTimer);
                if (typeof picker.destroy === 'function') picker.destroy();
            });
        }
        createSettingCheckbox(labelText, name, checked) {
            const label = createElement('label', {
                className: 'friends-setting-row friends-setting-toggle',
            });
            const input = createElement('input', {
                attributes: {
                    type: 'checkbox',
                    name,
                    'data-friend-setting': '',
                },
            });
            input.checked = checked;
            label.append(createElement('span', { text: labelText }), input);
            return label;
        }
        createSettingSelect(labelText, name, options, selected) {
            const label = createElement('label', {
                className: 'friends-setting-row',
            });
            const select = createElement('select', {
                className: 'form-control friends-setting-select',
                attributes: { name, 'data-friend-setting': '' },
            });
            for (const [value, text] of options) {
                const option = createElement('option', {
                    text,
                    attributes: { value },
                });
                option.selected = value === selected;
                select.append(option);
            }
            label.append(createElement('span', { text: labelText }), select);
            return label;
        }
    }
    class FriendsController extends FeatureController {
        constructor(app, name) {
            super(app, name);
            this.profileController = null;
            this.root = null;
            this.container = null;
            this.authActions = null;
            this.body = null;
            this.viewScope = null;
            this.viewRevision = 0;
            this.activeView = 'friends';
            this.activeChat = null;
            this.allUsers = null;
            this.searchTimer = 0;
            this.colorTimer = 0;
            this.friendsCache = [];
            this.friendQuery = '';
            this.presence = new FriendPresenceTracker(app, this);
            this.chatView = new PrivateChatView(app, this.resources, this);
            this.settingsPanel = new FriendSettingsPanel(app, this.resources, this);
            this.requestCount = 0;
        }
        async mount() {
            this.profileController = this.app.features.get('profile');
            this.root = document.querySelector('#mod_friends');
            this.container = this.root?.querySelector('#friends-content') ?? null;
            this.authActions = this.root?.querySelector('#friends-auth-actions') ?? null;
            if (!(this.root instanceof HTMLElement) || !(this.container instanceof HTMLElement)) return;
            this.resources.listen(this.root, 'click', (event) => this.handleClick(event));
            this.resources.listen(this.root, 'submit', (event) => this.handleSubmit(event));
            this.resources.listen(this.root, 'change', (event) => this.handleChange(event));
            this.resources.listen(this.root, 'input', (event) => this.handleInput(event));
            this.resources.add(this.app.backend.on('private-message', (message) => this.updatePrivateChat(message)));
            this.resources.add(this.profileController?.onChange((profile) => this.handleAccountChange(profile)) ?? (() => {}));
            this.handleAccountChange(this.profileController?.profile ?? null);
        }
        handleAccountChange(profile) {
            if (!(this.container instanceof HTMLElement)) return;
            this.container.classList.toggle('is-authenticated', Boolean(profile));
            if (this.authActions instanceof HTMLElement) this.authActions.hidden = Boolean(profile);
            const guestIntro = this.root?.querySelector('#friends-guest-intro');
            if (guestIntro instanceof HTMLElement) guestIntro.hidden = Boolean(profile);
            const guestSupport = this.root?.querySelector('.friends-guest-support');
            if (guestSupport instanceof HTMLElement) guestSupport.hidden = Boolean(profile);
            if (!profile) {
                this.resetView();
                this.container.replaceChildren();
                return;
            }
            this.loadLocalFriendState();
            this.createShell();
            void this.refreshRequestBadge();
            this.openFriends();
        }
        createShell() {
            if (!(this.container instanceof HTMLElement)) return;
            this.resetView();
            const header = createElement('div', {
                className: 'friends_header',
            });
            for (const [view, label] of [
                ['friends', 'Friends'],
                ['users', 'Discover'],
                ['requests', 'Requests'],
            ]) {
                const button = createElement('button', {
                    className: `modButton-black${view === this.activeView ? ' mod_selected' : ''}`,
                    attributes: {
                        type: 'button',
                        'data-friends-view': view,
                    },
                });
                button.append(createElement('span', { text: label }));
                if (view === 'friends') {
                    button.append(
                        createElement('span', {
                            className: 'friends-tab-badge',
                            attributes: {
                                'data-friends-unread-badge': '',
                                hidden: '',
                            },
                        })
                    );
                } else if (view === 'requests') {
                    button.append(
                        createElement('span', {
                            className: 'friends-tab-badge',
                            attributes: {
                                'data-friends-request-badge': '',
                                hidden: '',
                            },
                        })
                    );
                }
                header.append(button);
            }
            const settingsButton = createElement('button', {
                className: `modButton-black${this.activeView === 'settings' ? ' mod_selected' : ''}`,
                attributes: {
                    type: 'button',
                    'data-friends-view': 'settings',
                    style: 'width: 80px;',
                },
            });
            settingsButton.innerHTML = icon('gear', 20);
            header.append(settingsButton);
            this.body = createElement('div', {
                className: 'friends_body scroll',
                attributes: { 'data-friends-body': '' },
            });
            this.container.replaceChildren(header, this.body);
            this.updateUnreadBadge();
            this.updateRequestBadge();
        }
        resetView() {
            this.viewRevision += 1;
            this.viewScope?.dispose();
            this.viewScope = null;
            this.activeChat = null;
            clearTimeout(this.searchTimer);
            clearTimeout(this.colorTimer);
        }
        beginView(name) {
            this.activeView = name;
            this.viewRevision += 1;
            this.viewScope?.dispose();
            this.viewScope = this.resources.child(`view-${name}-${this.viewRevision}`);
            this.activeChat = null;
            clearTimeout(this.searchTimer);
            for (const button of this.container?.querySelectorAll('[data-friends-view]') ?? []) {
                button.classList.toggle('mod_selected', button.getAttribute('data-friends-view') === name);
            }
            this.body?.replaceChildren(
                createElement('div', {
                    className: 'friends-loading-state',
                    text: 'Loading…',
                })
            );
            return this.viewRevision;
        }
        isCurrent(revision) {
            return revision === this.viewRevision && !this.resources.disposed;
        }
        async request(path, init = {}) {
            if (!this.profileController) throw new Error('The profile controller is unavailable.');
            return this.profileController.request(path, init);
        }
        notify(message, kind = 'info') {
            this.app.features.get('modal')?.alert(String(message ?? ''), kind);
        }
        async handleClick(event) {
            const target = event.target instanceof Element ? event.target.closest('button, [data-friend-action]') : null;
            if (!(target instanceof Element)) return;
            if (target.id === 'login') {
                this.profileController?.openAccountDialog(true);
                return;
            }
            if (target.id === 'createAccount') {
                this.profileController?.openAccountDialog(false);
                return;
            }
            const view = target.getAttribute('data-friends-view');
            if (view === 'friends') {
                await this.openFriends();
                return;
            }
            if (view === 'users') {
                await this.openAllUsers();
                return;
            }
            if (view === 'requests') {
                await this.openRequests();
                return;
            }
            if (view === 'settings') {
                this.openSettings();
                return;
            }
            const action = target.getAttribute('data-friend-action');
            const id = target.getAttribute('data-user-id');
            if (action !== 'more') this.closeFriendMenus();
            if (action === 'profile') await this.profileController?.showProfile(id);
            else if (action === 'remove') await this.removeFriend(id);
            else if (action === 'chat') await this.openChat(id);
            else if (action === 'join-server') this.joinFriendServer(id);
            else if (action === 'join-tag') this.joinFriendTag(id);
            else if (action === 'favorite') this.toggleFavorite(id);
            else if (action === 'more') this.toggleFriendMenu(target);
            else if (action === 'note') this.openFriendNote(id);
            else if (action === 'add') await this.addFriend(id, target);
            else if (action === 'accept' || action === 'decline') await this.handleRequest(id, action);
            else if (action === 'chat-back') await this.openFriends();
            else if (action === 'edit-profile') this.profileController?.openEditor();
            else if (action === 'logout') {
                if (confirm('Are you sure you want to logout?')) await this.profileController?.logout();
            } else if (action === 'load-users') await this.loadMoreUsers();
        }
        handleSubmit(event) {
            if (!(event.target instanceof HTMLFormElement)) return;
            if (event.target.matches('[data-user-search-form]')) {
                event.preventDefault();
                const input = event.target.querySelector('input');
                this.searchUsers(input?.value ?? '');
            } else if (event.target.matches('[data-private-chat-form]')) {
                event.preventDefault();
                const input = event.target.querySelector('input');
                if (!(input instanceof HTMLInputElement)) return;
                this.sendPrivateMessage(input.value);
                input.value = '';
            }
        }
        handleInput(event) {
            const target = event.target;
            if (target instanceof HTMLInputElement && target.matches('[data-friend-search]')) {
                this.friendQuery = target.value;
                this.renderFriendsList();
            } else if (target instanceof HTMLInputElement && target.matches('[data-user-search]')) {
                clearTimeout(this.searchTimer);
                this.searchTimer = window.setTimeout(() => this.searchUsers(target.value), 400);
            } else if (target instanceof HTMLInputElement && target.name === 'highlight_color') {
                clearTimeout(this.colorTimer);
                this.colorTimer = window.setTimeout(() => this.updateSetting('highlight_color', target.value), 400);
            }
        }
        handleChange(event) {
            const target = event.target;
            if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
            if (!target.matches('[data-friend-setting]')) return;
            if (target instanceof HTMLInputElement && target.type === 'color') return;
            const type = target.name;
            const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
            this.updateSetting(type, value);
        }
        createUserRow(user, actions = [], options = {}) {
            const id = String(user?._id ?? user?.id ?? '');
            const isFriend = options.friend === true;
            const isRequest = options.request === true;
            const favorite = isFriend && this.localFriendState.favorites.has(id);
            const unread = isFriend ? Number(this.unreadMessages.get(id) || 0) : 0;
            const row = createElement('div', {
                className: `friends_row friends-user-row${user?.online ? ' is-online' : ' is-offline'}${favorite ? ' is-favorite' : ''}${unread ? ' has-unread' : ''}${isRequest ? ' is-request' : ''}`,
                attributes: { 'data-friend-row-id': id },
            });
            const identity = createElement('button', {
                className: 'friends-user-identity user-profile-wrapper',
                attributes: {
                    type: 'button',
                    'data-friend-action': 'profile',
                    'data-user-id': id,
                },
            });
            const imageRoot = createElement('span', {
                className: 'profile-img friends-user-avatar',
            });
            imageRoot.append(this.profileController.createAvatar(user, 44));
            imageRoot.append(
                createElement('span', {
                    className: `status_icon ${user?.online ? 'online_icon' : 'offline_icon'}`,
                })
            );
            const self = id && id === String(this.profileController?.profile?._id ?? '');
            const names = createElement('span', {
                className: 'friends-user-names',
            });
            const nameLine = createElement('span', {
                className: 'friends-name-line',
            });
            nameLine.append(
                createElement('strong', {
                    text: `${user?.username ?? 'Unknown user'}${self ? ' (You)' : ''}`,
                })
            );
            if (unread) {
                nameLine.append(
                    createElement('span', {
                        className: 'friends-unread-count',
                        text: unread > 99 ? '99+' : String(unread),
                    })
                );
            }
            names.append(nameLine);
            const note = isFriend ? String(this.localFriendState.notes[id] ?? '').trim() : '';
            const lastMessage = isFriend ? this.sessionMessages.get(id) : null;
            if (note) {
                names.append(
                    createElement('small', {
                        className: 'friends-note-preview',
                        text: note,
                        attributes: { title: 'Your note' },
                    })
                );
            } else if (lastMessage?.text) {
                names.append(
                    createElement('small', {
                        className: 'friends-message-preview',
                        text: `${lastMessage.mine ? 'You: ' : ''}${lastMessage.text}`,
                        attributes: { title: lastMessage.text },
                    })
                );
            } else if (user?.nick) {
                names.append(
                    createElement('small', {
                        text: user.nick,
                        attributes: { title: 'Nickname' },
                    })
                );
            } else if (isFriend) {
                names.append(
                    createElement('small', {
                        className: 'friends-presence-copy',
                        text: this.friendPresenceText(user),
                    })
                );
            }
            identity.append(imageRoot, names);

            const side = createElement('div', {
                className: 'friends-row-side',
            });
            const meta = createElement('div', {
                className: 'friends-user-meta',
            });
            if (user?.server)
                meta.append(
                    createElement('span', {
                        className: 'friends-meta-chip friends-server-chip',
                        text: user.server,
                    })
                );
            if (user?.tag)
                meta.append(
                    createElement('span', {
                        className: 'friends-meta-chip',
                        text: `#${user.tag}`,
                    })
                );
            if (!isFriend || (!user?.server && !user?.tag)) {
                meta.append(
                    createElement('span', {
                        className: `friends-meta-chip friends-role-chip${user?.role ? ` ${user.role}_role` : ''}`,
                        text: user?.role ?? 'user',
                    })
                );
            }
            if (meta.childElementCount) side.append(meta);

            if (actions.length) {
                const actionWrap = createElement('div', {
                    className: 'friends-row-actions',
                });
                for (const item of actions) {
                    const [action, label] = item;
                    if (action === 'join-server' && (!user?.online || !this.resolveFriendServer(user?.server))) continue;
                    if (action === 'join-tag' && !user?.tag) continue;
                    const button = createElement('button', {
                        className: `modButton centerXY friends-action-button friends-action-${action}${action === 'join-server' ? ' friends-action-primary' : ''}${action === 'favorite' && favorite ? ' is-active' : ''}`,
                        attributes: {
                            type: 'button',
                            title: label,
                            'aria-label': label,
                            'data-friend-action': action,
                            'data-user-id': id,
                        },
                    });
                    if (action === 'join-server') button.textContent = 'Join';
                    else button.innerHTML = this.actionIcon(action);
                    actionWrap.append(button);
                }
                if (isFriend) {
                    const moreWrap = createElement('div', {
                        className: 'friends-more-wrap',
                    });
                    const more = createElement('button', {
                        className: 'modButton centerXY friends-action-button friends-action-more',
                        attributes: {
                            type: 'button',
                            title: 'More',
                            'aria-label': 'More actions',
                            'data-friend-action': 'more',
                            'data-user-id': id,
                        },
                    });
                    more.innerHTML = this.actionIcon('more');
                    const menu = createElement('div', {
                        className: 'friends-row-menu',
                        attributes: { 'data-friend-menu': id },
                    });
                    if (user?.online && user?.tag) {
                        menu.append(this.createFriendMenuButton('join-tag', id, `Join #${user.tag}`));
                    }
                    menu.append(
                        this.createFriendMenuButton('note', id, note ? 'Edit note' : 'Add note'),
                        this.createFriendMenuButton('remove', id, 'Remove friend', true)
                    );
                    moreWrap.append(more, menu);
                    actionWrap.append(moreWrap);
                }
                side.append(actionWrap);
            }
            row.append(identity, side);
            return row;
        }
        createFriendMenuButton(action, id, label, danger = false) {
            return createElement('button', {
                className: `friends-row-menu-item${danger ? ' is-danger' : ''}`,
                text: label,
                attributes: {
                    type: 'button',
                    'data-friend-action': action,
                    'data-user-id': id,
                },
            });
        }
        actionIcon(action) {
            const iconNames = {
                remove: 'userMinus',
                chat: 'chat',
                add: 'userPlus',
                accept: 'check',
                decline: 'close',
                favorite: 'star',
                more: 'more',
            };
            return icon(iconNames[action], 16);
        }
        createEmptyState(title, description = '') {
            const state = createElement('div', {
                className: 'friends-empty-state',
            });
            state.append(createElement('strong', { text: title }));
            if (description) state.append(createElement('span', { text: description }));
            return state;
        }
        renderError(error, fallback) {
            this.body?.replaceChildren(this.createEmptyState("Couldn't load this", error?.message || fallback));
        }
        async openFriends() {
            const revision = this.beginView('friends');
            try {
                const payload = await this.request('/me/friends');
                if (!this.isCurrent(revision)) return;
                if (!payload?.success) throw new Error(String(payload?.message ?? 'Unable to load friends.'));
                const friends = Array.isArray(payload.friends) ? payload.friends : [];
                this.friendsCache = friends;
                const names = new Set();
                for (const friend of friends) if (friend?.nick) names.add(String(friend.nick));
                this.app.state.friends.names = names;
                this.trackFriendPresence(friends);
                this.friendQuery = '';
                this.body.replaceChildren();
                if (!friends.length) {
                    const empty = this.createEmptyState('No friends yet', 'Find someone in Discover and they will show up here.');
                    const discover = createElement('button', {
                        className: 'modButton-black friends-empty-action',
                        text: 'Find players',
                        attributes: {
                            type: 'button',
                            'data-friends-view': 'users',
                        },
                    });
                    empty.append(discover);
                    this.body.append(empty);
                    return;
                }
                const toolbar = createElement('div', {
                    className: 'friends-list-toolbar',
                });
                const summary = createElement('div', {
                    className: 'friends-list-summary',
                    attributes: { 'data-friends-summary': '' },
                });
                const search = createElement('div', {
                    className: 'friends-local-search',
                });
                search.append(
                    createElement('span', {
                        className: 'friends-local-search-icon',
                        icon: 'search',
                        iconSize: 16,
                    }),
                    createElement('input', {
                        className: 'form-control',
                        attributes: {
                            type: 'search',
                            placeholder: 'Search friends',
                            autocomplete: 'off',
                            'data-friend-search': '',
                        },
                    })
                );
                toolbar.append(summary, search);
                const list = createElement('div', {
                    className: 'friends-main-list',
                    attributes: { 'data-friends-list': '' },
                });
                this.body.append(toolbar, list);
                this.renderFriendsList();
            } catch (error) {
                if (this.isCurrent(revision)) this.renderError(error, 'Unable to load friends.');
            }
        }
        renderFriendsList() {
            if (this.activeView !== 'friends') return;
            const list = this.body?.querySelector('[data-friends-list]');
            const summary = this.body?.querySelector('[data-friends-summary]');
            if (!(list instanceof HTMLElement)) return;
            const normalized = String(this.friendQuery ?? '')
                .trim()
                .toLowerCase();
            const all = [...this.friendsCache];
            const onlineCount = all.filter((friend) => Boolean(friend?.online)).length;
            const unreadTotal = this.totalUnread();
            if (summary instanceof HTMLElement) {
                summary.textContent = `${onlineCount} online · ${all.length} friend${all.length === 1 ? '' : 's'}${unreadTotal ? ` · ${unreadTotal} unread` : ''}`;
            }
            const filtered = normalized
                ? all.filter((friend) => {
                      const id = String(friend?._id ?? friend?.id ?? '');
                      const note = String(this.localFriendState.notes[id] ?? '');
                      return [friend?.username, friend?.nick, friend?.server, friend?.tag, note].some((value) =>
                          String(value ?? '')
                              .toLowerCase()
                              .includes(normalized)
                      );
                  })
                : all;
            const rank = (friend) => {
                const id = String(friend?._id ?? friend?.id ?? '');
                return [
                    this.localFriendState.favorites.has(id) ? 0 : 1,
                    Number(this.unreadMessages.get(id) || 0) ? 0 : 1,
                    String(friend?.username ?? '').toLowerCase(),
                ];
            };
            const compare = (a, b) => {
                const ra = rank(a);
                const rb = rank(b);
                return ra[0] - rb[0] || ra[1] - rb[1] || ra[2].localeCompare(rb[2]);
            };
            const online = filtered.filter((friend) => Boolean(friend?.online)).sort(compare);
            const offline = filtered.filter((friend) => !friend?.online).sort(compare);
            list.replaceChildren();
            if (!filtered.length) {
                list.append(this.createEmptyState('No matches', 'Try another name, note, server or tag.'));
                return;
            }
            const appendGroup = (label, friends) => {
                if (!friends.length) return;
                const section = createElement('section', {
                    className: 'friends-presence-section',
                });
                const heading = createElement('div', {
                    className: 'friends-section-heading',
                });
                heading.append(createElement('span', { text: label }), createElement('span', { text: String(friends.length) }));
                const rows = createElement('div', {
                    className: 'friends-section-rows',
                });
                for (const friend of friends) {
                    rows.append(
                        this.createUserRow(
                            friend,
                            [
                                ['join-server', 'Join server'],
                                ['chat', 'Chat'],
                                [
                                    'favorite',
                                    this.localFriendState.favorites.has(String(friend?._id ?? friend?.id ?? ''))
                                        ? 'Unfavorite'
                                        : 'Favorite',
                                ],
                            ],
                            { friend: true }
                        )
                    );
                }
                section.append(heading, rows);
                list.append(section);
            };
            appendGroup('Online', online);
            appendGroup('Offline', offline);
        }
        async removeFriend(id) {
            if (!id || !confirm('Are you sure you want to remove this friend?')) return;
            try {
                const payload = await this.request('/me/handle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'remove-friend', userId: id }),
                });
                if (!payload?.success) throw new Error(String(payload?.message ?? 'Unable to remove friend.'));
                await this.openFriends();
            } catch (error) {
                this.notify(error.message || 'Unable to remove friend.', 'danger');
            }
        }
        async openRequests() {
            const revision = this.beginView('requests');
            try {
                const payload = await this.request('/me/requests');
                if (!this.isCurrent(revision)) return;
                const requests = Array.isArray(payload?.body) ? payload.body : [];
                this.requestCount = requests.length;
                this.updateRequestBadge();
                this.body.replaceChildren();
                if (!requests.length) this.body.append(this.createEmptyState('No requests', 'New friend requests will show up here.'));
                else
                    for (const user of requests)
                        this.body.append(
                            this.createUserRow(
                                user,
                                [
                                    ['accept', 'Accept'],
                                    ['decline', 'Decline'],
                                ],
                                { request: true }
                            )
                        );
            } catch (error) {
                if (this.isCurrent(revision)) this.renderError(error, 'Unable to load requests.');
            }
        }
        async handleRequest(id, action) {
            if (!id) return;
            try {
                const payload = await this.request('/me/handle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: `${action}-request`,
                        userId: id,
                    }),
                });
                if (payload?.success === false) throw new Error(String(payload.message ?? 'Unable to handle request.'));
                await this.openRequests();
                void this.refreshRequestBadge();
            } catch (error) {
                this.notify(error.message || 'Unable to handle request.', 'danger');
            }
        }
        async openAllUsers() {
            const revision = this.beginView('users');
            this.allUsers = {
                revision,
                offset: 0,
                amount: 5,
                exhausted: false,
                loading: false,
                ids: new Set(),
                query: '',
                searchRevision: 0,
            };
            const form = createElement('form', {
                className: 'friends-search-form',
                attributes: { 'data-user-search-form': '' },
            });
            form.append(
                createElement('span', {
                    className: 'friends-search-icon',
                    icon: 'search',
                    iconSize: 16,
                }),
                createElement('input', {
                    className: 'form-control friends-search-input',
                    attributes: {
                        type: 'search',
                        placeholder: 'Search users',
                        'data-user-search': '',
                    },
                })
            );
            const users = createElement('div', {
                className: 'friends-users-list',
                attributes: { 'data-users-container': '' },
            });
            const load = createElement('button', {
                className: 'modButton-black friends-load-more',
                text: 'Load more',
                attributes: {
                    type: 'button',
                    'data-friend-action': 'load-users',
                },
            });
            this.body.replaceChildren(form, users, load);
            this.viewScope.listen(this.body, 'scroll', () => {
                if (this.body.scrollTop + this.body.clientHeight >= this.body.scrollHeight - 80) this.loadMoreUsers();
            });
            await this.loadMoreUsers();
        }
        async loadMoreUsers() {
            const state = this.allUsers;
            if (!state || state.loading || state.exhausted || state.query || !this.isCurrent(state.revision)) return;
            state.loading = true;
            const loadButton = this.body?.querySelector('[data-friend-action="load-users"]');
            if (loadButton instanceof HTMLButtonElement) loadButton.disabled = true;
            try {
                const payload = await this.request('/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: state.amount,
                        offset: state.offset,
                    }),
                });
                if (!this.isCurrent(state.revision) || state.query) return;
                const users = Array.isArray(payload?.users) ? payload.users : [];
                state.offset += state.amount;
                state.exhausted = users.length === 0;
                this.appendUsers(users, state);
                if (loadButton instanceof HTMLElement) loadButton.hidden = state.exhausted;
            } catch (error) {
                this.notify(error.message || 'Unable to load users.', 'danger');
            } finally {
                state.loading = false;
                if (loadButton instanceof HTMLButtonElement) loadButton.disabled = false;
            }
        }
        appendUsers(users, state, replace = false) {
            const container = this.body?.querySelector('[data-users-container]');
            if (!(container instanceof HTMLElement)) return;
            if (replace) container.replaceChildren();
            for (const user of users) {
                const id = String(user?._id ?? user?.id ?? '');
                if (!id || state.ids.has(id)) continue;
                state.ids.add(id);
                const self = id === String(this.profileController?.profile?._id ?? '');
                container.append(this.createUserRow(user, self ? [] : [['add', 'Add friend']]));
            }
            if (!container.childElementCount) container.append(this.createEmptyState('No users found', 'Try another username or ID.'));
        }
        async searchUsers(query) {
            const state = this.allUsers;
            if (!state || !this.isCurrent(state.revision)) return;
            const normalized = String(query ?? '').trim();
            state.query = normalized;
            if (!normalized) {
                state.offset = 0;
                state.exhausted = false;
                state.ids.clear();
                const container = this.body?.querySelector('[data-users-container]');
                container?.replaceChildren();
                await this.loadMoreUsers();
                return;
            }
            const searchRevision = ++state.searchRevision;
            try {
                const payload = await this.request(`/search/?q=${encodeURIComponent(normalized)}`);
                if (!this.isCurrent(state.revision) || state.query !== normalized || searchRevision !== state.searchRevision) return;
                state.ids.clear();
                this.appendUsers(payload?.success && Array.isArray(payload.users) ? payload.users : [], state, true);
            } catch (error) {
                if (state.query === normalized) this.renderUsersMessage(error.message || `Couldn't find ${normalized}.`);
            }
        }
        renderUsersMessage(message) {
            const container = this.body?.querySelector('[data-users-container]');
            if (container instanceof HTMLElement) container.replaceChildren(this.createEmptyState('No users found', message));
        }
        async addFriend(id, button) {
            if (!id) return;
            if (button instanceof HTMLButtonElement) button.disabled = true;
            try {
                const payload = await this.request('/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ req_id: id }),
                });
                if (!payload?.success) throw new Error(String(payload?.message ?? 'Unable to send friend request.'));
                if (button instanceof HTMLButtonElement) button.textContent = 'Requested';
                this.notify(payload.message || 'Friend request sent.', 'success');
            } catch (error) {
                if (button instanceof HTMLButtonElement) button.disabled = false;
                this.notify(error.message || 'Unable to send friend request.', 'danger');
            }
        }
        async openChat(id) {
            if (!id) return;
            const revision = this.beginView('chat');
            try {
                const payload = await this.request(`/me/chat/${encodeURIComponent(String(id))}`);
                if (!this.isCurrent(revision)) return;
                if (!payload?.success || !isObject(payload.target)) throw new Error(String(payload?.message ?? 'Unable to open chat.'));
                this.activeChat = { id: String(id), revision };
                this.markFriendRead(String(id));
                const wrapper = createElement('div', {
                    className: 'friends-chat-wrapper',
                    attributes: { 'data-chat-id': id },
                });
                const header = createElement('div', {
                    className: 'friends-chat-header',
                });
                const identity = createElement('div', {
                    className: 'friends-chat-identity',
                });
                identity.append(
                    this.profileController.createAvatar(payload.target, 44),
                    createElement('strong', {
                        text: payload.target.username ?? 'User',
                    })
                );
                header.append(
                    identity,
                    createElement('button', {
                        className: 'modButton friends-chat-back',
                        text: 'Back',
                        attributes: {
                            type: 'button',
                            'data-friend-action': 'chat-back',
                        },
                    })
                );
                const messages = createElement('div', {
                    className: 'friends-chat-messages private-chat-content scroll',
                    attributes: { 'data-private-messages': '' },
                });
                const history = Array.isArray(payload.history) ? payload.history : [];
                if (history.length) {
                    const latest = history[history.length - 1];
                    this.rememberMessage(
                        String(id),
                        {
                            text: latest?.content ?? latest?.message ?? '',
                            mine: String(latest?.sender_id ?? '') === String(this.profileController?.profile?._id ?? ''),
                            at: latest?.timestamp ?? Date.now(),
                        },
                        false
                    );
                }
                if (!history.length)
                    messages.append(
                        createElement('p', {
                            text: 'This is the beginning of your conversation.',
                            attributes: { 'data-chat-empty': '' },
                        })
                    );
                else
                    for (const message of history)
                        this.appendMessage(messages, {
                            sender_id: message.sender_id,
                            message: message.content,
                            timestamp: message.timestamp,
                        });
                const form = createElement('form', {
                    className: 'messenger-wrapper',
                    attributes: { 'data-private-chat-form': '' },
                });
                form.append(
                    createElement('input', {
                        className: 'form-control',
                        attributes: {
                            type: 'text',
                            maxlength: 200,
                            placeholder: 'Enter a message…',
                            autocomplete: 'off',
                        },
                    }),
                    createElement('button', {
                        className: 'modButton-black friends-chat-send',
                        text: 'Send',
                        attributes: { type: 'submit' },
                    })
                );
                wrapper.append(header, messages, form);
                this.body.replaceChildren(wrapper);
                messages.scrollTop = messages.scrollHeight;
            } catch (error) {
                if (this.isCurrent(revision)) this.renderError(error, 'Unable to open chat.');
            }
        }
        sendPrivateMessage(value) {
            return this.chatView.sendPrivateMessage(value);
        }
        updatePrivateChat(data) {
            return this.chatView.updatePrivateChat(data);
        }
        appendMessage(container, data) {
            return this.chatView.appendMessage(container, data);
        }
        formatMessageTime(value) {
            return this.chatView.formatMessageTime(value);
        }
        get localFriendState() {
            return this.presence.localFriendState;
        }
        loadLocalFriendState() {
            this.presence.loadLocalFriendState();
            this.sessionMessages.clear();
            this.unreadMessages.clear();
        }
        saveLocalFriendState() {
            return this.presence.saveLocalFriendState();
        }
        trackFriendPresence(friends) {
            return this.presence.trackFriendPresence(friends);
        }
        friendPresenceText(user) {
            return this.presence.friendPresenceText(user);
        }
        formatRelativeTime(value) {
            return this.presence.formatRelativeTime(value);
        }
        get sessionMessages() {
            return this.chatView.sessionMessages;
        }
        get unreadMessages() {
            return this.chatView.unreadMessages;
        }
        totalUnread() {
            return this.chatView.totalUnread();
        }
        updateUnreadBadge() {
            return this.chatView.updateUnreadBadge();
        }
        updateRequestBadge() {
            const badge = this.container?.querySelector('[data-friends-request-badge]');
            if (!(badge instanceof HTMLElement)) return;
            const total = Math.max(0, Number(this.requestCount) || 0);
            badge.hidden = total <= 0;
            badge.textContent = total > 99 ? '99+' : String(total);
        }
        async refreshRequestBadge() {
            if (!this.profileController?.profile) return;
            try {
                const payload = await this.request('/me/requests');
                const requests = Array.isArray(payload?.body) ? payload.body : [];
                this.requestCount = requests.length;
                this.updateRequestBadge();
            } catch (error) {
                this.app.logger.warnOnce('friends-request-count', 'Unable to refresh friend request count', error);
            }
        }
        rememberMessage(id, message, unread = false) {
            return this.chatView.rememberMessage(id, message, unread);
        }
        markFriendRead(id) {
            return this.chatView.markFriendRead(id);
        }
        toggleFavorite(id) {
            const key = String(id ?? '');
            if (!key) return;
            if (this.localFriendState.favorites.has(key)) this.localFriendState.favorites.delete(key);
            else this.localFriendState.favorites.add(key);
            this.saveLocalFriendState();
            this.renderFriendsList();
        }
        closeFriendMenus(except = null) {
            for (const menu of this.body?.querySelectorAll('.friends-row-menu.is-open') ?? []) {
                if (menu === except) continue;
                menu.classList.remove('is-open');
            }
        }
        toggleFriendMenu(button) {
            const wrap = button instanceof Element ? button.closest('.friends-more-wrap') : null;
            const menu = wrap?.querySelector('.friends-row-menu');
            if (!(menu instanceof HTMLElement)) return;
            const open = !menu.classList.contains('is-open');
            this.closeFriendMenus(menu);
            menu.classList.toggle('is-open', open);
        }
        findFriend(id) {
            const key = String(id ?? '');
            return this.friendsCache.find((friend) => String(friend?._id ?? friend?.id ?? '') === key) ?? null;
        }
        resolveFriendServer(serverName) {
            const raw = String(serverName ?? '').trim();
            if (!raw) return null;
            const select = document.querySelector(SELECTORS.gameMode);
            if (!(select instanceof HTMLSelectElement)) return null;
            const normalize = (value) =>
                String(value ?? '')
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, '');
            const wanted = normalize(raw);
            for (const option of select.options) {
                const text = option.textContent?.trim() ?? '';
                const value = option.value ?? '';
                const host = (() => {
                    try {
                        return new URL(value.includes('://') ? value : `https://${value}`).hostname.split('.')[0] ?? '';
                    } catch {
                        return '';
                    }
                })();
                const aliases = [normalize(text), normalize(value), normalize(host)];
                if (aliases.includes(wanted)) return option;
            }
            return null;
        }
        joinFriendServer(id) {
            const friend = this.findFriend(id);
            const option = this.resolveFriendServer(friend?.server);
            const select = document.querySelector(SELECTORS.gameMode);
            if (!(option instanceof HTMLOptionElement) || !(select instanceof HTMLSelectElement)) {
                this.notify('That server is not available in the current server list.', 'danger');
                return;
            }
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            this.notify(`Switched to ${option.textContent?.trim() || friend?.server}.`, 'success');
        }
        joinFriendTag(id) {
            const friend = this.findFriend(id);
            const tag = String(friend?.tag ?? '')
                .trim()
                .slice(0, 3);
            if (!tag) return;
            const party = this.app.features.get('party');
            const input = party?.ensureTagInput?.() ?? document.querySelector('#tag');
            if (!(input instanceof HTMLInputElement)) {
                this.notify('Party tag input is unavailable.', 'danger');
                return;
            }
            input.value = tag;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            this.notify(`Joined #${tag}.`, 'success');
        }
        openFriendNote(id) {
            const friend = this.findFriend(id);
            if (!friend) return;
            const modal = this.app.features.get('modal');
            if (!modal) return;
            const key = String(id);
            const fragment = document.createDocumentFragment();
            const header = createElement('div', {
                className: 'default-modal-header',
            });
            const close = createElement('button', {
                className: 'btn closeBtn',
                attributes: { type: 'button', 'aria-label': 'Close' },
            });
            close.innerHTML = icon('close', 20);
            header.append(
                createElement('h2', {
                    text: `Note for ${friend?.username ?? 'friend'}`,
                }),
                close
            );
            const body = createElement('div', {
                className: 'default-modal-body friends-note-modal',
            });
            const input = createElement('input', {
                className: 'form-control',
                attributes: {
                    type: 'text',
                    maxlength: '60',
                    placeholder: 'e.g. met on EU1',
                },
            });
            input.value = String(this.localFriendState.notes[key] ?? '');
            const actions = createElement('div', {
                className: 'friends-note-actions',
            });
            const save = createElement('button', {
                className: 'modButton-black',
                text: 'Save',
                attributes: { type: 'button' },
            });
            const remove = createElement('button', {
                className: 'modButton-black friends-note-remove',
                text: 'Clear',
                attributes: { type: 'button' },
            });
            actions.append(remove, save);
            body.append(input, actions);
            fragment.append(header, body);
            modal.open('friends-note', fragment, {
                className: 'default-modal',
                closeOnBackdrop: true,
            });
            const scope = modal.modals.get('friends-note')?.scope;
            if (!scope) return;
            scope.listen(close, 'click', () => modal.close('friends-note'));
            scope.listen(save, 'click', () => {
                const value = input.value.trim().slice(0, 60);
                if (value) this.localFriendState.notes[key] = value;
                else delete this.localFriendState.notes[key];
                this.saveLocalFriendState();
                modal.close('friends-note');
                this.renderFriendsList();
            });
            scope.listen(remove, 'click', () => {
                delete this.localFriendState.notes[key];
                this.saveLocalFriendState();
                modal.close('friends-note');
                this.renderFriendsList();
            });
            requestAnimationFrame(() => input.focus());
        }
        openSettings() {
            return this.settingsPanel.openSettings();
        }
        upgradeFriendsColorPicker(Alwan, revision) {
            return this.settingsPanel.upgradeFriendsColorPicker(Alwan, revision);
        }
        createSettingCheckbox(labelText, name, checked) {
            return this.settingsPanel.createSettingCheckbox(labelText, name, checked);
        }
        createSettingSelect(labelText, name, options, selected) {
            return this.settingsPanel.createSettingSelect(labelText, name, options, selected);
        }
        async updateSetting(type, data) {
            try {
                const payload = await this.request('/me/update-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, data }),
                });
                if (!payload?.success) throw new Error(String(payload?.message ?? 'Unable to update setting.'));
                if (type === 'visible' && this.profileController?.profile) this.profileController.profile.visible = data;
                else this.app.state.friends.settings[type] = data;
            } catch (error) {
                this.notify(error.message || 'Unable to update friend setting.', 'danger');
            }
        }
        destroy() {
            this.app.features.get('modal')?.close('friends-note');
            this.resetView();
            super.destroy();
        }
    }
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // ~ Announcements, statistics, and shop                                               ~
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    class AnnouncementsController extends FeatureController {
        mount() {
            this.container = document.querySelector('#mod-announcements');
            if (!(this.container instanceof HTMLElement)) return;
            this.resources.listen(this.container, 'click', (event) => this.handleClick(event));
            void this.load();
        }
        async load() {
            try {
                const response = await fetch(`${ENDPOINTS.app}/announcements`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                const announcements = Array.isArray(payload.data) ? payload.data : [];
                announcements.sort(
                    (a, b) =>
                        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
                        new Date(b.date ?? b.createdAt ?? 0) - new Date(a.date ?? a.createdAt ?? 0)
                );
                this.render(announcements);
            } catch (error) {
                this.app.logger.warnOnce('announcements', 'Unable to load announcements', error);
            }
        }
        render(announcements) {
            this.container.replaceChildren();
            for (const announcement of announcements) {
                const id = String(announcement._id ?? announcement.id ?? '');
                if (!id) continue;
                const announcementIcon = String(announcement.icon ?? '');
                const title = String(announcement.title ?? 'Announcement');
                const description = String(announcement.preview ?? announcement.description ?? '');
                const pinned = Boolean(announcement.pinned);
                const card = createElement('div', {
                    className: 'mod-announcement',
                    attributes: { 'data-announcement-id': id },
                });
                if (announcementIcon) {
                    const iconUrl = safeHttpUrl(announcementIcon, true);
                    if (iconUrl) {
                        const iconImg = createElement('img', {
                            className: 'mod-announcement-icon',
                            attributes: {
                                src: iconUrl,
                                width: '32',
                                draggable: 'false',
                            },
                        });
                        card.append(iconImg);
                    }
                }
                const textWrapper = createElement('div', {
                    className: 'mod-announcement-text',
                });
                textWrapper.append(createElement('span', { text: title }), createElement('div', { text: description }));
                card.append(textWrapper);
                if (pinned) {
                    const pinnedIcon = createElement('span', {
                        className: 'sigmod-announcement-pinned',
                    });
                    pinnedIcon.innerHTML = icon('pushPin', 18);
                    card.append(pinnedIcon);
                }
                this.container.append(card);
            }
        }
        async handleClick(event) {
            const target = event.target instanceof Element ? event.target.closest('[data-announcement-id]') : null;
            const id = target?.dataset.announcementId;
            if (!id) return;
            try {
                const response = await fetch(`${ENDPOINTS.app}/announcement/${encodeURIComponent(id)}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                const announcement = payload.data ?? payload;
                this.openAnnouncementTab(announcement);
            } catch (error) {
                this.app.logger.warnOnce(`announcement-${id}`, 'Unable to load the announcement', error);
            }
        }
        openAnnouncementTab(data) {
            const menu = this.app.features.get('menu');
            const menuContent = menu?.root?.querySelector('.mod_menu_content');
            if (!(menuContent instanceof HTMLElement)) return;
            const existing = menuContent.querySelector('#announcement-tab');
            existing?.remove();
            const tab = createElement('section', {
                className: 'mod_tab scroll sigmod-announcement-tab',
                attributes: { id: 'announcement-tab', 'data-mod-panel': '' },
            });
            const header = createElement('div', {
                className: 'centerY justify-sb',
            });
            const identity = createElement('div', { className: 'centerY g-5' });
            const iconUrl = safeHttpUrl(data.preview?.icon ?? data.icon ?? '', true);
            const titleGroup = createElement('div', {
                className: 'f-column centerX',
            });
            titleGroup.append(
                createElement('h2', {
                    text: String(data.full?.title ?? data.title ?? 'Announcement'),
                })
            );
            const date = data.date ?? data.createdAt;
            titleGroup.append(
                createElement('span', {
                    className: 'sigmod-announcement-date',
                    text: date ? new Date(date).toLocaleDateString() : '',
                })
            );
            if (iconUrl) {
                identity.append(
                    createElement('img', {
                        className: 'sigmod-announcement-icon',
                        attributes: {
                            src: iconUrl,
                            width: '64',
                            draggable: 'false',
                        },
                    })
                );
            }
            identity.append(titleGroup);
            const back = createElement('button', {
                className: 'modButton-black sigmod-announcement-back',
                text: 'Back',
                attributes: { type: 'button', id: 'mod-announcement-back' },
            });
            header.append(identity, back);
            const content = createElement('div', {
                className: 'mod-announcement-content',
            });
            const description = createElement('div', {
                className: 'f-column g-10 scroll',
                text: data.full?.description ?? data.description ?? '',
            });
            const images = createElement('div', {
                className: 'mod-announcement-images scroll',
            });
            const imageList = Array.isArray(data.full?.images) ? data.full.images : [];
            for (const image of imageList) {
                const imageUrl = safeHttpUrl(image, true);
                if (!imageUrl) continue;
                const img = createElement('img', {
                    attributes: { src: imageUrl },
                });
                img.addEventListener('click', () => window.open(imageUrl, '_blank', 'noopener'));
                images.append(img);
            }
            content.append(description, images);
            tab.append(header, content);
            menuContent.append(tab);
            menu.openTab('announcement-tab');
            this.resources.listen(back, 'click', () => {
                tab.remove();
                menu.openTab('mod_home');
            });
        }
    }
    class StatisticsController extends FeatureController {
        constructor(app, name) {
            super(app, name);
            this.homeChart = null;
            this.timeChart = null;
            this.massChart = null;
            this.refreshToken = 0;
            this.chartPromise = null;
        }
        mount() {
            const menu = this.app.features.get('menu');
            const root = menu?.root;
            const openButton = root?.querySelector('#home-statistics-open');
            if (openButton instanceof HTMLButtonElement) {
                this.resources.listen(openButton, 'click', () => {
                    menu.openTab('mod_statistics');
                });
            }
            if (root instanceof HTMLElement) {
                this.resources.listen(root, 'sigmod:tabchange', (event) => {
                    this.activateCharts(event.detail?.tabId);
                });
                this.resources.listen(root, 'sigmod:menuopen', (event) => this.activateCharts(event.detail?.tabId));
            }
            this.refresh();
            if (menu?.isOpen()) this.activateCharts(menu.activeTab);
        }
        activateCharts(tabId) {
            if (tabId !== 'mod_statistics' && tabId !== 'mod_home') return;
            const menu = this.app.features.get('menu');
            if (!menu?.isOpen()) return;
            this.loadCharts().then(() => {
                if (this.resources.disposed) return;
                requestAnimationFrame(() => {
                    if (this.resources.disposed || !menu.isOpen()) return;
                    this.refresh();
                    if (tabId === 'mod_home') this.homeChart?.resize();
                    else {
                        this.timeChart?.resize();
                        this.massChart?.resize();
                    }
                });
            });
        }
        loadCharts(
            homeCanvas = document.querySelector('#sigmod-stats'),
            timeCanvas = document.querySelector('#statistics-time-chart'),
            massCanvas = document.querySelector('#statistics-mass-chart')
        ) {
            if (this.chartPromise) return this.chartPromise;
            if (
                !(homeCanvas instanceof HTMLCanvasElement) ||
                !(timeCanvas instanceof HTMLCanvasElement) ||
                !(massCanvas instanceof HTMLCanvasElement)
            )
                return Promise.resolve();
            this.chartPromise = this.app.dependencies
                .load('chart')
                .then((Chart) => {
                    if (this.resources.disposed) return;
                    if (!this.homeChart) this.createHomeChart(Chart, homeCanvas);
                    if (!this.timeChart) this.createTimeChart(Chart, timeCanvas);
                    if (!this.massChart) this.createMassChart(Chart, massCanvas);
                })
                .catch((error) => {
                    this.chartPromise = null;
                    this.app.logger.warnOnce('chart-library', 'Charts are unavailable', error);
                });
            return this.chartPromise;
        }
        read() {
            const fallback = {
                'time-played': 0,
                'highest-mass': 0,
                'total-deaths': 0,
                'total-mass': 0,
            };
            const value = readLocalJson(STORAGE.stats, null);
            return isObject(value) ? { ...fallback, ...value } : fallback;
        }
        readHistory(limit = 120) {
            return this.app.matchHistory.getRecent(limit);
        }
        async refresh() {
            const token = ++this.refreshToken;
            const stats = this.read();
            const [history, summary] = await Promise.all([this.readHistory(120), this.app.matchHistory.getSummary()]);
            if (this.resources.disposed || token !== this.refreshToken) return;
            const count = Math.max(0, Math.round(Number(summary?.count) || 0));

            this.setText('home-stats-time', this.formatDuration(stats['time-played']));
            this.setText('statistics-time-played', this.formatDuration(stats['time-played']));
            this.setText('statistics-highest-mass', this.formatNumber(stats['highest-mass']));
            this.setText('statistics-total-deaths', this.formatNumber(stats['total-deaths']));
            this.setText('statistics-total-mass', this.formatNumber(stats['total-mass']));

            this.setText('statistics-average-time', `${count ? this.formatDuration(summary.totalDuration / count) : '0m'} avg.`);
            this.setText('statistics-kills', this.formatNumber(summary.totalKills));
            this.setText(
                'statistics-avg-kills',
                count ? (summary.totalKills / count).toFixed(summary.totalKills / count >= 10 ? 0 : 1) : '0'
            );
            this.setText('statistics-pellets', this.formatNumber(summary.totalPellets));
            this.setText('statistics-splits', this.formatNumber(summary.totalSplits));
            this.setText('statistics-best-position', summary.bestPosition !== null ? `#${summary.bestPosition}` : '—');
            this.setText('statistics-average-ping', summary.pingCount ? `${Math.round(summary.pingTotal / summary.pingCount)} ms` : '—');

            const homeEmpty = document.getElementById('home-stats-empty');
            if (homeEmpty instanceof HTMLElement) homeEmpty.hidden = count > 0;
            const detailEmpty = document.getElementById('statistics-time-empty');
            if (detailEmpty instanceof HTMLElement) detailEmpty.hidden = count > 0;

            this.renderMatches(history);
            this.updateCharts(history);
        }
        setText(id, value) {
            const element = document.getElementById(id);
            if (element) element.textContent = String(value);
        }
        updateCharts(history) {
            const home = history.slice(-12);
            if (this.homeChart) {
                this.homeChart.data.labels = home.map((_, index) => index + 1);
                this.homeChart.data.datasets[0].data = home.map((item) => item.duration / 60);
                this.homeChart.update('none');
            }

            const detailed = history.slice(-24);
            if (this.timeChart) {
                this.timeChart.data.labels = detailed.map((item, index) => this.formatHistoryLabel(item, detailed.length - index));
                this.timeChart.data.datasets[0].data = detailed.map((item) => item.duration / 60);
                this.timeChart.update('none');
            }

            const mass = history.slice(-18);
            if (this.massChart) {
                this.massChart.data.labels = mass.map((_, index) => index + 1);
                this.massChart.data.datasets[0].data = mass.map((item) => item.highestMass);
                this.massChart.update('none');
            }
        }
        createHomeChart(Chart, canvas) {
            const context = canvas.getContext('2d');
            const gradient = context?.createLinearGradient(0, 0, canvas.width, 0);
            gradient?.addColorStop(0, 'rgba(104, 113, 241, .2)');
            gradient?.addColorStop(1, 'rgba(132, 139, 255, .05)');
            this.homeChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            data: [],
                            borderColor: '#7d84ff',
                            backgroundColor: gradient || 'rgba(104, 113, 241, .12)',
                            borderWidth: 1.5,
                            pointRadius: 0,
                            pointHoverRadius: 3,
                            tension: 0.32,
                            fill: true,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    interaction: { intersect: false, mode: 'index' },
                    scales: {
                        x: { display: false },
                        y: {
                            display: false,
                            beginAtZero: true,
                            grace: '15%',
                        },
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            displayColors: false,
                            callbacks: {
                                title: () => '',
                                label: (context) => this.formatDuration((context.raw || 0) * 60),
                            },
                        },
                    },
                },
            });
            this.resources.add(() => {
                this.homeChart?.destroy();
                this.homeChart = null;
            });
        }
        createTimeChart(Chart, canvas) {
            this.timeChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Play time',
                            data: [],
                            borderColor: '#7d84ff',
                            backgroundColor: 'rgba(104, 113, 241, .1)',
                            borderWidth: 2,
                            pointRadius: 2,
                            pointHoverRadius: 4,
                            pointBackgroundColor: '#9ba0ff',
                            tension: 0.28,
                            fill: true,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { intersect: false, mode: 'index' },
                    scales: {
                        x: {
                            grid: { display: false },
                            border: { display: false },
                            ticks: {
                                color: '#606060',
                                font: { size: 9 },
                                maxTicksLimit: 7,
                            },
                        },
                        y: {
                            beginAtZero: true,
                            border: { display: false },
                            grid: { color: 'rgba(255,255,255,.045)' },
                            ticks: {
                                color: '#606060',
                                font: { size: 9 },
                                maxTicksLimit: 4,
                                callback: (value) => `${Math.round(value)}m`,
                            },
                        },
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            displayColors: false,
                            callbacks: {
                                label: (context) => `Played ${this.formatDuration((context.raw || 0) * 60)}`,
                            },
                        },
                    },
                },
            });
            this.resources.add(() => {
                this.timeChart?.destroy();
                this.timeChart = null;
            });
        }
        createMassChart(Chart, canvas) {
            this.massChart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Peak mass',
                            data: [],
                            backgroundColor: 'rgba(104, 113, 241, .28)',
                            borderColor: 'rgba(125, 132, 255, .9)',
                            borderWidth: 1,
                            borderRadius: 3,
                            maxBarThickness: 18,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        x: {
                            display: false,
                            grid: { display: false },
                            border: { display: false },
                        },
                        y: {
                            beginAtZero: true,
                            border: { display: false },
                            grid: { color: 'rgba(255,255,255,.04)' },
                            ticks: {
                                color: '#606060',
                                font: { size: 9 },
                                maxTicksLimit: 4,
                                callback: (value) => this.formatNumber(value),
                            },
                        },
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            displayColors: false,
                            callbacks: {
                                title: (context) => `Match ${context[0].label}`,
                                label: (context) => `Peak ${this.formatNumber(context.raw)}`,
                            },
                        },
                    },
                },
            });
            this.resources.add(() => {
                this.massChart?.destroy();
                this.massChart = null;
            });
        }
        renderMatches(history) {
            const root = document.getElementById('statistics-recent-matches');
            if (!(root instanceof HTMLElement)) return;
            root.replaceChildren();
            const matches = history.slice(-6).reverse();
            if (!matches.length) {
                root.append(
                    createElement('div', {
                        className: 'statistics-matches-empty',
                        text: 'Your completed matches will appear here.',
                    })
                );
                return;
            }
            for (const match of matches) {
                const row = createElement('div', {
                    className: 'statistics-match',
                });
                const main = createElement('div', {
                    className: 'statistics-match-main',
                });
                main.append(
                    createElement('strong', {
                        text: this.formatMatchDate(match.at),
                    }),
                    createElement('span', {
                        text: this.formatMatchTime(match.at),
                    })
                );
                row.append(
                    main,
                    this.matchStat('Time', this.formatDuration(match.duration)),
                    this.matchStat('Mass', this.formatNumber(match.highestMass)),
                    this.matchStat('Kills', this.formatNumber(match.kills)),
                    this.matchStat('Ping', match.averagePing > 0 ? `${match.averagePing} ms` : '—')
                );
                root.append(row);
            }
        }
        matchStat(label, value) {
            const root = createElement('div', {
                className: 'statistics-match-stat',
            });
            root.append(createElement('span', { text: label }), createElement('strong', { text: value }));
            return root;
        }
        formatHistoryLabel(item, fallbackIndex) {
            if (!item.at) return `#${fallbackIndex}`;
            const date = new Date(item.at);
            if (Number.isNaN(date.getTime())) return `#${fallbackIndex}`;
            return date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
            });
        }
        formatMatchDate(timestamp) {
            const date = new Date(timestamp);
            if (Number.isNaN(date.getTime())) return 'Match';
            return date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
            });
        }
        formatMatchTime(timestamp) {
            const date = new Date(timestamp);
            if (Number.isNaN(date.getTime())) return '';
            return date.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
            });
        }
        formatDuration(seconds) {
            const total = Math.max(0, Math.floor(Number(seconds) || 0));
            const hours = Math.floor(total / 3600);
            const minutes = Math.floor((total % 3600) / 60);
            if (hours > 0) return `${hours}h ${minutes}m`;
            if (minutes > 0) return `${minutes}m`;
            return total > 0 ? `${total}s` : '0m';
        }
        formatNumber(value) {
            const number = Math.max(0, Math.round(Number(value) || 0));
            if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(number >= 10_000_000_000 ? 0 : 1)}b`;
            if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}m`;
            if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 10_000 ? 0 : 1)}k`;
            return String(number);
        }
        destroy() {
            super.destroy();
            this.homeChart = null;
            this.timeChart = null;
            this.massChart = null;
        }
    }
    class ShopController extends FeatureController {
        async mount() {
            this.resources.add(this.app.backend.on('shop-items-available', (content) => this.showAvailability(content)));
        }
        showAvailability(content) {
            if (this.app.settings.settings.removeShopPopup) return;
            const popup = document.querySelector('#shop-popup');
            if (!(popup instanceof HTMLElement)) return;
            popup.hidden = !content;
            if (typeof content === 'string') popup.title = content;
        }
    }
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // ~ Application composition and startup                                               ~
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    const FEATURE_PHASES = [
        [
            ['auth', AuthController],
            ['style', StyleController],
            ['modal', ModalController],
            ['visuals', VisualController],
            ['canvasHooks', CanvasHooks],
        ],
        [
            ['menu', MenuController],
            ['mainMenu', MainMenuController],
            ['gameSettings', GameSettingsController],
            ['themes', ThemeController],
            ['savedNames', SavedNamesController],
        ],
        [
            ['matchStatistics', MatchStatisticsController],
            ['session', SessionController],
            ['macros', MacroController],
            ['smartPing', SmartPingController],
        ],
        [
            ['chat', ChatController],
            ['party', PartyController],
            ['minimap', MinimapController],
        ],
        [
            ['profile', ProfileController],
            ['friends', FriendsController],
            ['shop', ShopController],
            ['tournament', TournamentController],
        ],
        [
            ['challenges', ChallengeController],
            ['screenshots', ScreenshotController],
            ['announcements', AnnouncementsController],
            ['statistics', StatisticsController],
            ['quickAccess', QuickAccessController],
        ],
    ];