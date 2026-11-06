//! Protocols an app asks for at startup that the host answers without doing
//! anything visible with yet. Each answers correctly, so the app starts; none
//! changes what the tab shows.

use smithay::delegate_fractional_scale;
use smithay::delegate_text_input_manager;
use smithay::delegate_viewporter;
use smithay::delegate_xdg_activation;
use smithay::reexports::wayland_server::protocol::wl_surface::WlSurface;
use smithay::reexports::wayland_server::DisplayHandle;
use smithay::wayland::compositor::with_states;
use smithay::wayland::fractional_scale::{with_fractional_scale, FractionalScaleHandler, FractionalScaleManagerState};
use smithay::wayland::text_input::TextInputManagerState;
use smithay::wayland::viewporter::ViewporterState;
use smithay::wayland::xdg_activation::{
    XdgActivationHandler, XdgActivationState, XdgActivationToken, XdgActivationTokenData,
};

use crate::session::SessionState;

pub struct Stubs {
    pub activation: XdgActivationState,
    _text_input: TextInputManagerState,
    _viewporter: ViewporterState,
    _fractional_scale: FractionalScaleManagerState,
}

impl Stubs {
    pub fn new(dh: &DisplayHandle) -> Stubs {
        Stubs {
            // Apps ask to raise a window (a link opened from another app).
            // Tokens are handed out; activation requests are ignored, since
            // only the owner raises windows.
            activation: XdgActivationState::new::<SessionState>(dh),
            // Input methods: none yet. The keyboard is the chosen layout's keymap.
            _text_input: TextInputManagerState::new::<SessionState>(dh),
            // Scaling of a buffer: a viewport's destination is the surface's
            // size (an app drawing at the fractional scale's preferred scale
            // sets one). Cropping to its source rectangle is not applied.
            _viewporter: ViewporterState::new::<SessionState>(dh),
            // The preferred scale is the output's, a whole number.
            _fractional_scale: FractionalScaleManagerState::new::<SessionState>(dh),
        }
    }
}

impl XdgActivationHandler for SessionState {
    fn activation_state(&mut self) -> &mut XdgActivationState {
        &mut self.stubs_mut().activation
    }

    fn request_activation(
        &mut self,
        _token: XdgActivationToken,
        _token_data: XdgActivationTokenData,
        _surface: WlSurface,
    ) {
    }
}

impl FractionalScaleHandler for SessionState {
    fn new_fractional_scale(&mut self, surface: WlSurface) {
        let scale = self.scale() as f64;
        with_states(&surface, |states| {
            with_fractional_scale(states, |fs| fs.set_preferred_scale(scale))
        });
    }
}

delegate_xdg_activation!(SessionState);
delegate_text_input_manager!(SessionState);
delegate_viewporter!(SessionState);
delegate_fractional_scale!(SessionState);
