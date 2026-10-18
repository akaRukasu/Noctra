package com.noctra.mobile.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.Session
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.sin

/** Connexion : carte de verre sur l'aurore de Noctra. */
@Composable
fun LoginScreen() {
    var server by rememberSaveable { mutableStateOf(Session.lastServer) }
    var username by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val shake = remember { Animatable(0f) }
    val appear = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    LaunchedEffect(Unit) { appear.animateTo(1f, spring(dampingRatio = 0.78f, stiffness = 120f)) }

    fun signIn() {
        if (working || username.isEmpty()) return
        working = true
        error = null
        focus.clearFocus()
        scope.launch {
            try {
                Session.signIn(server, username, password)
            } catch (failure: Exception) {
                error = failure.message
                shake.snapTo(0f)
                shake.animateTo(1f, spring(dampingRatio = 0.3f, stiffness = 400f))
            }
            working = false
        }
    }

    Box(Modifier.fillMaxSize()) {
        AuroraBackground()
        Column(
            Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(60.dp))
            Column(
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.graphicsLayer { alpha = appear.value; scaleX = 0.9f + 0.1f * appear.value; scaleY = scaleX }
            ) {
                NoctraMark(84.dp)
                Text("Noctra", style = Theme.display(46).copy(brush = Brush.horizontalGradient(0f to Color.White, 0.4f to Color(0xFFF5F0FF), 0.75f to Theme.lilac, 1f to Theme.cyan)))
                Text("Films, séries et TV en direct", color = Theme.muted)
            }
            Spacer(Modifier.height(28.dp))
            Column(
                Modifier.widthIn(max = 520.dp).fillMaxWidth()
                    .graphicsLayer {
                        alpha = appear.value
                        translationY = (1 - appear.value) * 40.dp.toPx()
                        translationX = 10.dp.toPx() * sin(shake.value * PI.toFloat() * 4)
                    }
                    .auroraPanel(30.dp).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                LoginField("Serveur", server, Icons.Filled.Dns, KeyboardType.Uri, ImeAction.Next, onNext = { focus.moveFocus(FocusDirection.Down) }) { server = it }
                LoginField("Nom d’utilisateur", username, Icons.Filled.Person, KeyboardType.Text, ImeAction.Next, onNext = { focus.moveFocus(FocusDirection.Down) }) { username = it }
                LoginField("Mot de passe", password, Icons.Filled.Lock, KeyboardType.Password, ImeAction.Go, secure = true, onNext = { signIn() }) { password = it }
                AnimatedVisibility(error != null, enter = fadeIn(), exit = fadeOut()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Warning, contentDescription = null, tint = Theme.orange, modifier = Modifier.size(18.dp))
                        Text(error ?: "", color = Theme.orange, fontSize = 13.sp)
                    }
                }
                AuroraPrimaryButton(onClick = { signIn() }, enabled = !working && username.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
                    if (working) {
                        CircularProgressIndicator(Modifier.size(18.dp), color = Theme.onAccent, strokeWidth = 2.dp)
                        Spacer(Modifier.width(10.dp))
                    }
                    Text(if (working) "Connexion…" else "Se connecter", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                }
            }
            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun LoginField(title: String, value: String, icon: ImageVector, keyboard: KeyboardType, ime: ImeAction, secure: Boolean = false, onNext: () -> Unit, onChange: (String) -> Unit) {
    TextField(
        value = value, onValueChange = onChange, singleLine = true,
        placeholder = { Text(title, color = Theme.muted) },
        leadingIcon = { Icon(icon, contentDescription = null, tint = Theme.accent) },
        visualTransformation = if (secure) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard, imeAction = ime, autoCorrectEnabled = false),
        keyboardActions = KeyboardActions(onNext = { onNext() }, onGo = { onNext() }, onDone = { onNext() }),
        textStyle = TextStyle(color = Theme.ink, fontSize = 16.sp),
        shape = CircleShape,
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color(0x990C0E1C), unfocusedContainerColor = Color(0x990C0E1C),
            focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Theme.accent
        ),
        modifier = Modifier.fillMaxWidth().border(1.dp, Color(0x33DDD6FE), CircleShape)
    )
}
