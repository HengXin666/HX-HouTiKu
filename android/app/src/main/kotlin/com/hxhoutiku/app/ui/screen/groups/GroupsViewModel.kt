package com.hxhoutiku.app.ui.screen.groups

import androidx.lifecycle.ViewModel
import com.hxhoutiku.app.data.repository.MessageRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

@HiltViewModel
class GroupsViewModel @Inject constructor(
    repository: MessageRepository
) : ViewModel() {
    val groups: Flow<List<String>> = repository.observeGroups()
}
